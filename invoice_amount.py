"""Invoice totals from positioned PDF text, uppercase RMB, and offline OCR."""
from dataclasses import dataclass
from decimal import Decimal
from functools import lru_cache
import logging
import re
from threading import Lock
import unicodedata

import pymupdf as fitz

logger = logging.getLogger(__name__)
OCR_LOCK = Lock()
MONEY = r"(-?(?:\d{1,3}(?:,\d{3})+|\d{1,10})\.\d{2})(?!\d)"
LABEL = r"(?:\(?小写\)?|价税合计|含税金额|合计金额|总金额|totalamount|grandtotal)"
RAILWAY_MARKERS = ("铁路电子客票", "电子客票号")
DIGITS = dict(zip("零壹贰叁肆伍陆柒捌玖", range(10)))
UPPER = "零壹贰叁肆伍陆柒捌玖拾佰仟万亿"


def normalize(text):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text)).replace("−", "-").replace("圆", "元").replace("貳", "贰").replace("參", "叁").replace("陸", "陆").replace("萬", "万").replace("億", "亿").lower()


def upper_rmb(text):
    """Parse only complete financial-uppercase RMB expressions, using integer cents."""
    match = re.fullmatch(rf"(负)?([{UPPER}]+)元(?:(整|正)|(?:([零壹贰叁肆伍陆柒捌玖])角)?(?:零?([零壹贰叁肆伍陆柒捌玖])分)?(?:整|正)?)", text)
    if not match or not text.split("元", 1)[1]:
        return None
    total, section, number = 0, 0, 0
    for char in match[2]:
        if char in DIGITS:
            number = DIGITS[char]
        elif char in "拾佰仟":
            section += (number or 1) * {"拾": 10, "佰": 100, "仟": 1000}[char]
            number = 0
        elif char == "万":
            section = (section + number) * 10000
            number = 0
        elif char == "亿":
            total += (section + number) * 100000000
            section = number = 0
    cents = (total + section + number) * 100 + DIGITS.get(match[4], 0) * 10 + DIGITS.get(match[5], 0)
    if match[1]:
        cents = -cents
    return f"{Decimal(cents) / 100:.2f}"


def candidates(text, railway=None):
    text = normalize(text)
    if railway is None:
        railway = any(marker in text for marker in RAILWAY_MARKERS)
    label = LABEL[:-1] + (r"|票价)" if railway else ")")
    found = set()
    # Adjacency is intentional: never use the largest amount or any arbitrary ¥ field.
    for match in re.finditer(label + r"[:：]?[¥￥]?" + MONEY, text):
        found.add(f"{Decimal(match[1].replace(',', '')):.2f}")
    # Some generators place the currency sign and digits before the '(小写)' label.
    for match in re.finditer(r"[¥￥]" + MONEY + r"\(?小写\)?", text):
        found.add(f"{Decimal(match[1].replace(',', '')):.2f}")
    upper_pattern = rf"(?:价税合计(?:\(大写\))?|\(大写\))[:：]?(负?[{UPPER}]+元[整正零壹贰叁肆伍陆柒捌玖角分]*)"
    for match in re.finditer(upper_pattern, text):
        value = upper_rmb(match[1])
        if value is not None:
            found.add(value)
    return found


def ocr_candidates(text, railway=None):
    """Accept common punctuation substitutions only next to an explicit total label."""
    text = normalize(text)
    if railway is None:
        railway = any(marker in text for marker in RAILWAY_MARKERS)
    label = LABEL[:-1] + (r"|票价)" if railway else ")")
    found = candidates(text, railway=railway)
    loose_money = r"(-?\d[\d.,，]{0,18}[.,]\d{2})(?!\d)"
    for match in re.finditer(label + r"[:：]?[¥￥]?" + loose_money, text):
        raw = match[1].replace("，", ",")
        decimal_at = max(raw.rfind("."), raw.rfind(","))
        whole = re.sub(r"[.,]", "", raw[:decimal_at])
        decimal = raw[decimal_at + 1:]
        if re.fullmatch(r"-?\d{1,10}", whole) and re.fullmatch(r"\d{2}", decimal):
            found.add(f"{Decimal(whole + '.' + decimal):.2f}")
    return found


def amount_from_text(text):
    values = candidates(text)
    return next(iter(values)) if len(values) == 1 else None


@dataclass
class TextBox:
    x0: float
    y0: float
    x1: float
    y1: float
    text: str
    confidence: float = 1.0


def positioned_candidates(boxes, confidence=0, ocr=False):
    """Reassemble physical rows instead of assuming PDF object order is reading order."""
    rows = []
    railway = any(marker in normalize(box.text) for box in boxes for marker in RAILWAY_MARKERS)
    for box in sorted(boxes, key=lambda b: ((b.y0 + b.y1) / 2, b.x0)):
        if box.confidence < confidence:
            continue
        for row in reversed(rows[-4:]):
            anchor = row[0]
            overlap = min(anchor.y1, box.y1) - max(anchor.y0, box.y0)
            if overlap >= .45 * min(anchor.y1 - anchor.y0, box.y1 - box.y0):
                row.append(box)
                break
        else:
            rows.append([box])
    values = set()
    for row in rows:
        line = " ".join(box.text for box in sorted(row, key=lambda b: b.x0))
        values.update(ocr_candidates(line, railway=railway) if ocr else candidates(line, railway=railway))
    return values


def result(amount=None, source=None, status="unrecognized", message="未找到明确的价税合计，请检查原票后重试识别。"):
    return {"amount": amount, "amount_source": source, "amount_status": status, "amount_message": message}


@lru_cache(maxsize=1)
def ocr_engine():
    from rapidocr_onnxruntime import RapidOCR
    # The wheel includes Chinese recognition models; no file or text is sent to a service.
    return RapidOCR(det_model_path=None, det_limit_side_len=1600, det_limit_type="max")


def ocr_boxes(page):
    zoom = min(3, 2400 / max(page.rect.width, page.rect.height))
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csRGB, alpha=False)
    with OCR_LOCK:
        output, _ = ocr_engine()(pix.tobytes("png"))
    boxes = []
    for points, text, score in output or []:
        boxes.append(TextBox(min(p[0] for p in points), min(p[1] for p in points),
                             max(p[0] for p in points), max(p[1] for p in points), text, float(score)))
    return boxes


def recognize_amount(page, use_ocr=True):
    native = candidates(page.get_text(sort=True))
    boxes = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                boxes.append(TextBox(*span["bbox"], span["text"]))
    native.update(positioned_candidates(boxes))
    if len(native) == 1:
        return result(next(iter(native)), "pdf_text", "recognized", "已从发票合计字段自动提取")
    if len(native) > 1:
        return result(status="conflict", message="检测到多个不同合计或大小写金额不一致，需复核原票。")
    if not use_ocr:
        return result()
    try:
        boxes = ocr_boxes(page)
        # Keep label and amount together at a strong confidence threshold.
        values = positioned_candidates(boxes, confidence=.70, ocr=True)
        if len(values) == 1:
            return result(next(iter(values)), "ocr", "recognized", "已通过本机 OCR 自动识别，请核对原票")
        if len(values) > 1:
            return result(status="conflict", message="OCR 检测到多个不同合计或大小写金额不一致，需复核原票。")
        if positioned_candidates(boxes, confidence=.55, ocr=True):
            return result(status="low_confidence", message="已找到金额候选，但图片识别置信度不足，需复核原票。")
        return result()
    except Exception:
        logger.exception("Local invoice OCR failed")
        return result(status="ocr_error", message="本机 OCR 暂不可用，请确认依赖已安装后重试识别。")

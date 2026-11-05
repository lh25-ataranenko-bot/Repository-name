"""Photo processing: only real images, resized, re-encoded to WebP without metadata (EXIF/GPS)."""

import io
import secrets
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from ..config import get_settings

MAX_BYTES = 8 * 1024 * 1024
MAX_SIDE = 1600
LICENSES = {
    "own": "Власне фото",
    "cc-by-4.0": "CC BY 4.0",
    "cc-by-sa-4.0": "CC BY-SA 4.0",
    "cc0": "CC0 (суспільне надбання)",
    "permission": "З дозволу правовласника",
}
Image.MAX_IMAGE_PIXELS = 60_000_000  # refuse decompression bombs


def media_root() -> Path:
    p = Path(get_settings().media_dir)
    (p / "photos").mkdir(parents=True, exist_ok=True)
    return p


def process(data: bytes) -> tuple[str, int, int]:
    """Validates and stores the image; returns (filename, width, height)."""
    if len(data) > MAX_BYTES:
        raise ValueError("Фото більше за 8 МБ")
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()  # structure check; a fresh open is needed after verify
        img = Image.open(io.BytesIO(data))
        if img.format not in ("JPEG", "PNG", "WEBP"):
            raise ValueError("Підтримуються JPEG, PNG або WebP")
        img = ImageOps.exif_transpose(img).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ValueError("Файл не є коректним зображенням") from e
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    name = f"{secrets.token_hex(12)}.webp"
    img.save(media_root() / "photos" / name, "WEBP", quality=82, method=4)  # metadata is not copied
    return name, img.width, img.height


def delete_file(name: str) -> None:
    (media_root() / "photos" / name).unlink(missing_ok=True)

"""Download official pretrained weights and an upstream demonstration photo."""
import os
from pathlib import Path
from urllib.request import Request, urlopen

from ai_service.config.settings import SAMPLE, WEIGHTS

ASSETS = (
    (WEIGHTS, "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolo11n.pt"),
    (SAMPLE, "https://raw.githubusercontent.com/ultralytics/ultralytics/main/ultralytics/assets/bus.jpg"),
)


def download(target: Path, url: str):
    if target.exists():
        print(f"Keeping existing file: {target}")
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".part")
    try:
        request = Request(url, headers={"User-Agent": "civic-eye-phase1"})
        with urlopen(request, timeout=60) as response, temporary.open("xb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        # Link creation fails if a destination appeared while downloading.
        os.link(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"Downloaded {target}")


def main():
    for target, url in ASSETS:
        download(target, url)


if __name__ == "__main__":
    main()

"""Package only training source code, excluding environments, secrets and datasets."""
import argparse
from pathlib import Path
from zipfile import ZipFile


def package(output: Path):
    root = Path(__file__).resolve().parents[1]
    selected = [root / "__init__.py", root / "requirements.txt", root / "scripts/__init__.py",
                root / "scripts/train.py", root / "config/__init__.py", root / "config/settings.py"]
    for directory in ("training", "dataset_tools"):
        selected.extend(path for path in (root / directory).rglob("*")
                        if path.is_file() and "__pycache__" not in path.parts and path.suffix in {".py", ".md", ".ipynb"})
    output.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(output, "x") as archive:
        for path in sorted(selected):
            archive.write(path, path.relative_to(root.parent).as_posix())
    return len(selected)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "runs/colab-training-code.zip")
    args = parser.parse_args()
    print(f"Packaged {package(args.output)} source files: {args.output}")


if __name__ == "__main__":
    main()

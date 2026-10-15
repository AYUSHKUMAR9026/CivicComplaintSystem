"""Delete stray "pot_1234" placeholder categories.

These rows were created accidentally: all are display-named "Potholes" and
duplicate the real "pothole" category (id 1). They were previously hidden by a
`name LIKE 'pot_%'` filter, which also hid the real category because `_` is a
LIKE wildcard. The filter is now escaped, so the junk has to actually go.

Dry run by default. Nothing is deleted without --apply.

    backend/.venv/Scripts/python.exe cleanup_junk_categories.py
    backend/.venv/Scripts/python.exe cleanup_junk_categories.py --apply

A junk category that still has complaints attached is never deleted silently.
Pass --reassign to move those complaints to the real "pothole" category first.
"""
import argparse
import sys

from sqlalchemy import text

from db.session import SessionLocal

REAL_POTHOLE = "pothole"
# Escaped: matches a literal "pot_" prefix, not "pothole".
JUNK_PATTERN = r"pot\_%"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    parser.add_argument("--reassign", action="store_true",
                        help="move complaints off junk categories onto the real pothole category")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        junk = db.execute(text(
            "SELECT id, name, display_name FROM categories "
            "WHERE name LIKE :pattern ESCAPE '\\' ORDER BY id"
        ), {"pattern": JUNK_PATTERN}).fetchall()

        if not junk:
            print("No junk categories found. Nothing to do.")
            return 0

        target = db.execute(text(
            "SELECT id FROM categories WHERE name = :name"
        ), {"name": REAL_POTHOLE}).fetchone()

        print(f"Found {len(junk)} junk categories:")
        audited = []
        for row in junk:
            used = db.execute(text(
                "SELECT COUNT(*) FROM complaints WHERE category_id = :cid"
            ), {"cid": row.id}).scalar()
            flag = f"{used} complaint(s) attached" if used else "unused"
            print(f"  id={row.id:<4} name={row.name:<12} display={row.display_name!r:<12} {flag}")
            audited.append((row, used))
        blocked = [pair for pair in audited if pair[1]]
        deletable = [pair for pair in audited if not pair[1]]

        if blocked and not args.reassign:
            print(f"\n{len(blocked)} category(ies) still have complaints attached and will NOT be "
                  f"deleted. Re-run with --reassign to move those complaints to '{REAL_POTHOLE}' first.")
        if blocked and args.reassign and not target:
            print(f"\nCannot reassign: no category named '{REAL_POTHOLE}' exists.", file=sys.stderr)
            return 1

        if not args.apply:
            moves = sum(used for _, used in blocked) if args.reassign else 0
            count = len(junk) if args.reassign else len(deletable)
            print(f"\nDRY RUN. Would reassign {moves} complaint(s) and delete {count} category(ies).")
            print("Re-run with --apply to make these changes.")
            return 0

        removed = 0
        for row, used in audited:
            if used:
                if not args.reassign:
                    continue
                db.execute(text(
                    "UPDATE complaints SET category_id = :target WHERE category_id = :cid"
                ), {"target": target.id, "cid": row.id})
                print(f"Reassigned {used} complaint(s) from id={row.id} to id={target.id}")
            db.execute(text("DELETE FROM categories WHERE id = :cid"), {"cid": row.id})
            removed += 1
        db.commit()
        print(f"\nDeleted {removed} junk category(ies).")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())

from nt_classify.regions import ALL_REGIONS, ANCHOR, OTHER_REGION, PUBLIC_REGIONS


def test_seven_regions() -> None:
    assert len(ALL_REGIONS) == 7
    assert len(PUBLIC_REGIONS) == 6
    assert OTHER_REGION in ALL_REGIONS
    assert OTHER_REGION not in PUBLIC_REGIONS


def test_anchors_cover_all_regions() -> None:
    assert set(ANCHOR.keys()) == set(ALL_REGIONS)
    # Anchors must be unique and slug-safe.
    slugs = list(ANCHOR.values())
    assert len(slugs) == len(set(slugs))
    for slug in slugs:
        assert slug == slug.lower()
        assert all(c.isalnum() or c == "-" for c in slug)

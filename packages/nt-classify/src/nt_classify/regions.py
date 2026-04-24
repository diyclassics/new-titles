"""The classification regions.

Seven internally — the 7th, "Cross-Cultural Studies & Other", is used by the
classifier and annotation tools but is suppressed (or treated separately) in the
publication HTML TOC. See ``PUBLIC_REGIONS`` and ``ALL_REGIONS``.
"""

from typing import Final

PUBLIC_REGIONS: Final[tuple[str, ...]] = (
    "European and Classical Antiquity",
    "Egypt & North Africa",
    "Ancient Western Asia",
    "The Caucasus & The Western Steppe",
    "Central Asia & Siberia",
    "China, South Asia, & East Asia",
)

OTHER_REGION: Final[str] = "Cross-Cultural Studies & Other"

ALL_REGIONS: Final[tuple[str, ...]] = (*PUBLIC_REGIONS, OTHER_REGION)

# Anchor slug per region, matching the historical publication HTML.
ANCHOR: Final[dict[str, str]] = {
    "European and Classical Antiquity": "classical",
    "Egypt & North Africa": "egypt",
    "Ancient Western Asia": "neareast",
    "The Caucasus & The Western Steppe": "caucasus",
    "Central Asia & Siberia": "centralasia",
    "China, South Asia, & East Asia": "eastasia",
    "Cross-Cultural Studies & Other": "crosscultural",
}

"""The two decisions that keep the book encyclopaedic instead of repetitive. Pure functions.

1. Is this concept one we already have?   exact name or alias -> yes;
                                           embedding similarity >= threshold -> yes;
                                           otherwise it is new.
2. What do we do with this claim?          the nearest existing claims of the same concept (top 3)
                                           that are similar enough are judged by a short LLM check:
                                             "same"        -> duplicate: add the source as evidence
                                             "contradicts" -> conflict: keep ours, record theirs
                                           otherwise      -> new claim.
"""

import re
from typing import Literal

Decision = Literal["duplicate", "conflict", "new"]


def singular(word: str) -> str:
    """Just enough English plural rules for glossary titles: indexes, policies, trees."""
    if len(word) <= 3:
        return word
    if word.endswith("ies"):
        return word[:-3] + "y"
    if re.search(r"(x|ss|ch|sh)es$", word):
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def normalise(name: str) -> str:
    """'B+ Trees', 'b+ tree' and 'B+  tree' are the same key; only the last word is singularised."""
    words = re.sub(r"\s+", " ", name.strip().lower()).split(" ")
    return " ".join([*words[:-1], singular(words[-1])])


def match_concept(name: str, aliases: list[str], known: dict[str, str]) -> str | None:
    """`known` maps normalised names/aliases -> concept id. Returns the id on an exact match."""
    for candidate in [name, *aliases]:
        concept_id = known.get(normalise(candidate))
        if concept_id:
            return concept_id
    return None


def is_same_concept(similarity: float, threshold: float) -> bool:
    return similarity >= threshold


def decide_claim(candidates: list[tuple[str, float, str | None]], compare_threshold: float) -> tuple[Decision, str | None]:
    """`candidates`: the nearest existing claims of the same concept as (claim_id, similarity,
    verdict), where verdict is the LLM's "same" / "contradicts" / "unrelated" (None if not asked).

    Several neighbours are checked, not just the closest: "a table can have several clustered
    indexes" is closest to "a clustered index sets the row order" (unrelated) but contradicts
    the second closest, "a table can have only one clustered index". A contradiction anywhere
    wins, then a duplicate, otherwise the claim is new. Returns (decision, existing claim id)."""
    close = [(cid, v) for cid, sim, v in candidates if sim >= compare_threshold and v is not None]
    for claim_id, verdict in close:
        if verdict == "contradicts":
            return "conflict", claim_id
    for claim_id, verdict in close:
        if verdict == "same":
            return "duplicate", claim_id
    return "new", None

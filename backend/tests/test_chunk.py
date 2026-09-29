from app.ingest.chunk import chunk_pages, detect_heading, split_to_fit
from app.ingest.extract import ExtractedPage
from app.text_utils import count_tokens


def make_pages(n_pages: int = 3, sentences_per_page: int = 60) -> list[ExtractedPage]:
    pages = []
    for p in range(1, n_pages + 1):
        body = " ".join(f"Sentence {i} on page {p} talks about databases and indexing." for i in range(sentences_per_page))
        pages.append(ExtractedPage(page=p, text=f"{p}.1 Section Heading {p}\n{body}"))
    return pages


def test_chunks_respect_max_size():
    chunks = chunk_pages(make_pages(), target_tokens=120, max_tokens=160, overlap_ratio=0.15)
    assert len(chunks) > 3
    assert all(c.token_count <= 160 + 20 for c in chunks)  # small slack for join newlines


def test_chunk_indexes_are_sequential():
    chunks = chunk_pages(make_pages(), target_tokens=120, max_tokens=160)
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))


def test_consecutive_chunks_overlap_within_a_section():
    chunks = chunk_pages(make_pages(n_pages=1, sentences_per_page=80), target_tokens=120, max_tokens=160, overlap_ratio=0.2)
    first, second = chunks[0], chunks[1]
    last_line_of_first = first.text.splitlines()[-1]
    assert last_line_of_first in second.text


def test_pages_and_headings_are_tracked():
    chunks = chunk_pages(make_pages(), target_tokens=120, max_tokens=160)
    assert chunks[0].page == 1
    assert chunks[-1].page_end == 3
    assert chunks[0].heading == "1.1 Section Heading 1"
    assert any(c.heading == "3.1 Section Heading 3" for c in chunks)


def test_empty_input_gives_no_chunks():
    assert chunk_pages([ExtractedPage(page=1, text="   \n\n ")]) == []


def test_split_to_fit_breaks_long_text_into_small_pieces():
    long_sentence = "word " * 2000
    pieces = split_to_fit(long_sentence, max_tokens=100, separators=[". ", " "])
    assert all(count_tokens(p) <= 100 for p in pieces)
    assert "".join(pieces).replace(" ", "") == long_sentence.replace(" ", "")


def test_heading_detection():
    assert detect_heading("# Introduction") == "Introduction"
    assert detect_heading("2.1 Indexing Strategies") == "2.1 Indexing Strategies"
    assert detect_heading("CHAPTER ONE") == "CHAPTER ONE"
    assert detect_heading("This is a normal sentence that ends with a period.") is None
    assert detect_heading("2019 was a big year for us") is None


def test_bold_markdown_headings_are_cleaned():
    assert detect_heading("**1. The Relational Model**") == "1. The Relational Model"
    assert detect_heading("## **Indexing**") == "Indexing"

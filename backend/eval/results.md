# Retrieval evaluation

Embedding model: `gemini-embedding-001` | rerank LLM: `gemini-3.8-flash` | 33 questions over 3 documents (33 chunks) | chunk target 200 tokens, 15% overlap | k_dense=20, k_bm25=20, RRF k=60, MMR lambda=0.7 | run 2026-09-29 05:36 UTC

| Retrieval mode | Recall@1 | Recall@5 | MRR@10 | MRR (keyword Qs) | MRR (paraphrase Qs) |
|---|---|---|---|---|---|
| Dense only (Chroma) | 0.82 | 0.97 | 0.89 | 0.88 | 0.91 |
| BM25 only | 0.91 | 0.97 | 0.94 | 0.97 | 0.91 |
| Hybrid (RRF) | 0.82 | 1.00 | 0.90 | 0.90 | 0.91 |
| Hybrid (RRF) + MMR | 0.82 | 1.00 | 0.90 | 0.88 | 0.91 |
| Hybrid + MMR + LLM rerank | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |

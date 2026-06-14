# Example knowledge base

Add your own `.md` files here. The chatbot reads every markdown file in this folder (including subfolders) and uses the most relevant sections to answer questions.

## How it works

1. Place markdown files in `docs/`
2. Run `npm run ingest-docs` to embed chunks into PostgreSQL (pgvector)
3. Ask the chatbot questions — it uses semantic search to find relevant sections

## Tips

- Use `##` headings to split topics; each section becomes a retrievable chunk
- Keep sections focused on one topic
- Include exact phrases users might ask about (hours, pricing, policies, product names)

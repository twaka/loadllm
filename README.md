# loadllm

A load testing tool for LLM streaming APIs.

![loadllm](https://github.com/user-attachments/assets/7defec48-c6d4-4219-b74b-4d873987c4be)

## Usage

### 1. Setup

```bash
git clone https://github.com/twaka/loadllm.git
cd loadllm
npm install
npm run build
chmod +x dist/cli.js
```

```bash
export OPENAI_API_BASE="http://localhost:8000/v1" # openai compatible endpoint to test
export OPENAI_API_KEY="sk-your-key"              # api key for the endpoint
```

### 2. Run

- Run a test with 3 concurrent virtual users for 60 seconds using the `gpt-oss-20b` model:
  ```bash
  dist/cli.js -m gpt-oss-20b -c 3 -d 60
  ```

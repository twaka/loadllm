# loadllm

A load testing tool for LLM streaming APIs.

![Image](https://github.com/user-attachments/assets/f5a58244-91c2-4a67-80e7-2dda2b8e4a99)

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

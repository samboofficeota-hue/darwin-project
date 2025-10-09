# Cloud Run デプロイガイド

## 🎯 目的

文字起こし処理をCloud Run上で完結させるため、必要なAPIエンドポイントをCloud Runにデプロイします。

## 📦 必要なAPIエンドポイント

### 1. `/api/transcribe-chunks`
**ファイル:** `pages/api/transcribe-chunks.js`
**役割:** チャンク化された音声ファイルの文字起こしジョブを開始

**リクエスト:**
```json
{
  "userId": "user_xxxxx",
  "sessionId": "session_xxxxx",
  "chunks": [
    {
      "id": "chunk_0",
      "chunkId": "segment_001_chunk_0",
      "cloudPath": "users/user_xxxxx/sessions/session_xxxxx/chunks/segment_001_chunk_0.wav",
      "startTime": 0,
      "endTime": 180,
      "duration": 180
    }
  ]
}
```

**レスポンス:**
```json
{
  "success": true,
  "jobId": "transcribe_user_xxxxx_session_xxxxx_timestamp",
  "message": "文字起こし処理を開始しました",
  "totalChunks": 32
}
```

### 2. `/api/audio-transcription-status`
**ファイル:** `pages/api/audio-transcription-status.js`
**役割:** 文字起こしジョブの進捗状況を取得

**リクエスト:**
```
GET /api/audio-transcription-status?jobId=transcribe_user_xxxxx_session_xxxxx_timestamp
```

**レスポンス:**
```json
{
  "jobId": "transcribe_user_xxxxx_session_xxxxx_timestamp",
  "status": "processing",
  "progress": 50,
  "completedChunks": 16,
  "totalChunks": 32,
  "lastUpdate": "2025-10-09T00:42:07.546Z"
}
```

### 3. `/api/cloud-storage/signed-url`
**ファイル:** `pages/api/cloud-storage/signed-url.js`
**役割:** Google Cloud Storage への署名付きURLを生成

## 🚀 Cloud Run デプロイ方法

### オプション1: 手動デプロイ（推奨）

#### ステップ1: Cloud Runの現在の状態を確認

```bash
# Cloud Run URLにアクセスして、APIが存在するか確認
curl https://darwin-project-574364248563.asia-northeast1.run.app/api/health
```

#### ステップ2: 必要なファイルを確認

デプロイに必要なファイル：
- `pages/api/transcribe-chunks.js`
- `pages/api/audio-transcription-status.js`
- `pages/api/cloud-storage/signed-url.js`
- `lib/storage.js`（Redis接続）
- `lib/text-processor.js`（テキスト整形）

#### ステップ3: Dockerfileの確認

Cloud Runはコンテナベースなので、Dockerfileが必要です：

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# 依存関係のインストール
COPY package*.json ./
RUN npm ci --only=production

# アプリケーションファイルのコピー
COPY . .

# Next.jsのビルド
RUN npm run build

# ポート設定
EXPOSE 8080

# 起動コマンド
CMD ["npm", "start"]
```

#### ステップ4: Cloud Runにデプロイ

```bash
# Google Cloud CLIを使用
gcloud run deploy darwin-project \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars "$(cat .env.local | grep -v '^#' | xargs | sed 's/ /,/g')"
```

### オプション2: GitHub Actionsで自動デプロイ

`.github/workflows/deploy-cloud-run.yml` を作成：

```yaml
name: Deploy to Cloud Run

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v0
        with:
          service_account_key: ${{ secrets.GCP_SA_KEY }}
          project_id: whgc-project
          
      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy darwin-project \
            --source . \
            --region asia-northeast1 \
            --platform managed \
            --allow-unauthenticated
```

## 🔧 デプロイ前のチェックリスト

### 環境変数の設定

Cloud Runに以下の環境変数が設定されているか確認：

- [ ] `GOOGLE_CLOUD_PROJECT_ID`
- [ ] `GOOGLE_CLIENT_EMAIL`
- [ ] `GOOGLE_PRIVATE_KEY_ID`
- [ ] `GOOGLE_PRIVATE_KEY`
- [ ] `GOOGLE_CLIENT_ID`
- [ ] `GCS_BUCKET_NAME`
- [ ] `KV_REST_API_URL`
- [ ] `KV_REST_API_TOKEN`

### ファイル構造の確認

```
Darwin-project/
├── pages/
│   └── api/
│       ├── transcribe-chunks.js ✅
│       ├── audio-transcription-status.js ✅
│       ├── cloud-storage/
│       │   └── signed-url.js ✅
│       └── health.js
├── lib/
│   ├── storage.js ✅
│   ├── text-processor.js ✅
│   └── cloud-storage.js ✅
├── src/
│   └── app/
│       ├── chunked-transcribe/
│       │   └── page.tsx ✅
│       └── audio-transcribe/
│           └── [jobId]/
│               └── page.tsx ✅
├── Dockerfile
├── package.json
└── next.config.js
```

## 🧪 デプロイ後のテスト

### 1. ヘルスチェック

```bash
curl https://darwin-project-574364248563.asia-northeast1.run.app/api/health
```

期待される結果：
```json
{
  "status": "ok",
  "timestamp": "2025-10-09T00:00:00.000Z"
}
```

### 2. 環境変数チェック

```bash
curl https://darwin-project-574364248563.asia-northeast1.run.app/api/check-env
```

期待される結果：
```json
{
  "overallStatus": "ok",
  "checks": {
    "privateKey": {
      "status": "ok",
      "message": "Private key is properly configured"
    }
  }
}
```

### 3. 署名付きURL生成テスト

```bash
curl -X POST https://darwin-project-574364248563.asia-northeast1.run.app/api/cloud-storage/signed-url \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "sessionId": "test_session",
    "chunkId": "chunk_0",
    "operation": "upload"
  }'
```

期待される結果：
```json
{
  "success": true,
  "signedUrl": "https://storage.googleapis.com/...",
  "filePath": "users/test_user/sessions/test_session/chunks/chunk_0.wav"
}
```

### 4. 文字起こしジョブ開始テスト

```bash
curl -X POST https://darwin-project-574364248563.asia-northeast1.run.app/api/transcribe-chunks \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test_user",
    "sessionId": "test_session",
    "chunks": [
      {
        "id": "chunk_0",
        "chunkId": "chunk_0",
        "cloudPath": "users/test_user/sessions/test_session/chunks/chunk_0.wav",
        "startTime": 0,
        "endTime": 180,
        "duration": 180
      }
    ]
  }'
```

期待される結果：
```json
{
  "success": true,
  "jobId": "transcribe_test_user_test_session_timestamp",
  "message": "文字起こし処理を開始しました",
  "totalChunks": 1
}
```

## 🐛 トラブルシューティング

### エラー1: "404 Not Found"

**原因:** APIエンドポイントがデプロイされていない

**対処法:**
1. Cloud Runのログを確認
2. `pages/api/` ディレクトリのファイルが含まれているか確認
3. 再デプロイ

### エラー2: "500 Internal Server Error"

**原因:** 環境変数が正しく設定されていない

**対処法:**
1. Cloud Runの環境変数を確認
2. `/api/check-env` でエラー詳細を確認
3. 環境変数を修正して再デプロイ

### エラー3: "CORS Error"

**原因:** CORSヘッダーが設定されていない

**対処法:**
各APIファイルに以下を追加：
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
```

## 📊 現在の状況確認

### Cloud Runの確認コマンド

```bash
# サービス情報を取得
gcloud run services describe darwin-project \
  --region asia-northeast1 \
  --platform managed

# 環境変数を確認
gcloud run services describe darwin-project \
  --region asia-northeast1 \
  --format="value(spec.template.spec.containers[0].env)"

# ログを確認
gcloud run logs read darwin-project \
  --region asia-northeast1 \
  --limit 50
```

## 🎯 次のステップ

1. Cloud Runに必要なAPIがデプロイされているか確認
2. 環境変数が正しく設定されているか確認
3. APIエンドポイントをテスト
4. 問題があればログを確認して修正
5. ブラウザで文字起こし処理をテスト

---

**更新日:** 2025-10-09
**Cloud Run URL:** https://darwin-project-574364248563.asia-northeast1.run.app


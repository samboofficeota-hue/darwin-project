# GOOGLE_PRIVATE_KEY 修正ガイド

## 🎯 問題

エラーメッセージ：
```
error:1E08010C:DECODER routines::unsupported
```

このエラーは、Google Cloud Speech APIが`GOOGLE_PRIVATE_KEY`をデコードできないことを示しています。

**原因:** Cloud Runの環境変数で改行文字が正しく設定されていない

## 🔧 解決方法

### Cloud Runの環境変数設定を修正

#### 手順1: Google Cloud Consoleにアクセス

1. https://console.cloud.google.com/run にアクセス
2. `darwin-project` サービスを選択
3. 「編集してデプロイ」をクリック

#### 手順2: 環境変数の修正

「変数とシークレット」タブで`GOOGLE_PRIVATE_KEY`を見つけて修正：

**❌ 間違った設定（現在）:**
```
-----BEGIN PRIVATE KEY----- MIIEvglBADANBgkqhk... （1行で全て）
```

または

```
-----BEGIN PRIVATE KEY-----\nMIIEvglBADANBgkqhk...\n-----END PRIVATE KEY-----\n
```

**✅ 正しい設定:**

Cloud Runの環境変数エディタで、**実際の改行を含めて**以下のように入力：

```
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
（秘密鍵の内容を複数行で貼り付け）
-----END PRIVATE KEY-----
```

#### 手順3: 正しい入力方法

1. **テキストエディタで準備:**
   - サービスアカウントキーのJSONファイルを開く
   - `private_key`フィールドの値をコピー
   - 値から`"`（ダブルクォート）を削除
   - `\n`を実際の改行に置換

2. **Pythonスクリプトで変換（推奨）:**

```python
#!/usr/bin/env python3
import json

# サービスアカウントキーJSONファイルを読み込む
with open('service-account-key.json', 'r') as f:
    key = json.load(f)

# private_keyを整形
private_key = key['private_key']

# \nを実際の改行に変換
formatted_key = private_key.replace('\\n', '\n')

print("=== Cloud Runに貼り付ける内容 ===")
print(formatted_key)
```

実行：
```bash
python3 format_key.py
```

出力をコピーして、Cloud Runの環境変数エディタに貼り付け。

#### 手順4: デプロイ

1. 「デプロイ」ボタンをクリック
2. デプロイが完了するまで待つ（1-2分）

## 🧪 修正の確認

### 方法1: テストリクエスト

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

ジョブが作成されたら、そのジョブIDを使ってステータスを確認：

```bash
curl "https://darwin-project-574364248563.asia-northeast1.run.app/api/audio-transcription-status?jobId=YOUR_JOB_ID"
```

エラーメッセージに`DECODER routines::unsupported`が含まれていなければ成功です。

### 方法2: check-env APIを使用

```bash
curl https://darwin-project-574364248563.asia-northeast1.run.app/api/check-env
```

`privateKey.status`が`"ok"`になっていることを確認。

## 📝 別の方法: gcloud CLIを使用

環境変数をファイルから設定する方法：

```bash
# 1. 秘密鍵をファイルに保存（改行を含む）
cat > private_key.txt << 'EOF'
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
（秘密鍵の内容）
-----END PRIVATE KEY-----
EOF

# 2. Cloud Runサービスを更新
gcloud run services update darwin-project \
  --region asia-northeast1 \
  --update-env-vars "GOOGLE_PRIVATE_KEY=$(cat private_key.txt)"

# 3. ファイルを削除（セキュリティのため）
rm private_key.txt
```

## 🔐 セキュリティのベストプラクティス

### Secret Managerを使用（推奨）

環境変数に直接秘密鍵を設定する代わりに、Google Cloud Secret Managerを使用：

```bash
# 1. Secretを作成
gcloud secrets create google-private-key \
  --data-file=service-account-key.json \
  --replication-policy=automatic

# 2. Cloud Runサービスに権限を付与
gcloud secrets add-iam-policy-binding google-private-key \
  --member=serviceAccount:YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

# 3. Cloud Runサービスで使用
gcloud run services update darwin-project \
  --region asia-northeast1 \
  --update-secrets=GOOGLE_PRIVATE_KEY=google-private-key:latest
```

## ⚠️ よくある間違い

### 間違い1: `\n`を含む文字列

```
"-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"
```

これは文字列として`\n`が含まれてしまい、改行として認識されません。

### 間違い2: 1行で全て

```
-----BEGIN PRIVATE KEY----- MIIEvglBADANBgkqhk... -----END PRIVATE KEY-----
```

改行がないため、正しいPEM形式ではありません。

### 間違い3: スペースやタブの混入

```
-----BEGIN PRIVATE KEY-----
  MIIEvgIBADA...  （先頭にスペース）
```

PEM形式では、先頭にスペースやタブがあってはいけません。

## ✅ 正しいフォーマット

```
-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...
（Base64エンコードされた秘密鍵、64文字ごとに改行）
...
-----END PRIVATE KEY-----
```

- ヘッダーとフッターは独立した行
- 秘密鍵本体は64文字ごとに改行（通常）
- 先頭・末尾にスペースやタブなし
- 末尾に改行あり

## 🎯 確認チェックリスト

- [ ] Cloud Runの環境変数を確認
- [ ] `GOOGLE_PRIVATE_KEY`を正しいフォーマットで設定
- [ ] 改行が実際の改行文字であることを確認
- [ ] `\n`が文字列として含まれていないことを確認
- [ ] デプロイを実行
- [ ] テストリクエストでエラーが出ないことを確認

---

**更新日:** 2025-10-09


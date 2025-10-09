#!/bin/bash

# Cloud Run環境変数更新スクリプト
# GOOGLE_PRIVATE_KEYを正しいフォーマットで設定します

set -e

echo "==================================================================="
echo "Cloud Run 環境変数更新スクリプト"
echo "==================================================================="
echo ""

# プロジェクトとリージョンの設定
PROJECT_ID="whgc-project"
SERVICE_NAME="darwin-project"
REGION="asia-northeast1"

echo "📋 設定情報:"
echo "  プロジェクト: $PROJECT_ID"
echo "  サービス名: $SERVICE_NAME"
echo "  リージョン: $REGION"
echo ""

# Google Cloud CLIがインストールされているか確認
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud コマンドが見つかりません"
    echo ""
    echo "Google Cloud SDKをインストールしてください:"
    echo "https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# 認証確認
echo "🔐 Google Cloud認証を確認中..."
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "⚠️  Google Cloudにログインしていません"
    echo ""
    echo "次のコマンドでログインしてください:"
    echo "  gcloud auth login"
    exit 1
fi

CURRENT_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo "✅ ログイン中: $CURRENT_ACCOUNT"
echo ""

# プロジェクトを設定
echo "🔧 プロジェクトを設定中..."
gcloud config set project $PROJECT_ID 2>&1 | grep -v "Updated property"

# サービスアカウントキーJSONファイルを探す
echo ""
echo "🔍 サービスアカウントキーファイルを探しています..."
echo ""

KEY_FILE=""

# よくある場所を確認
POSSIBLE_LOCATIONS=(
    "service-account-key.json"
    "credentials.json"
    "key.json"
    "$HOME/.config/gcloud/application_default_credentials.json"
)

for location in "${POSSIBLE_LOCATIONS[@]}"; do
    if [ -f "$location" ]; then
        echo "  ✅ 見つかりました: $location"
        KEY_FILE="$location"
        break
    fi
done

if [ -z "$KEY_FILE" ]; then
    echo "  ❌ サービスアカウントキーファイルが見つかりませんでした"
    echo ""
    echo "📝 サービスアカウントキーファイルのパスを入力してください:"
    read -r KEY_FILE
    
    if [ ! -f "$KEY_FILE" ]; then
        echo "❌ Error: ファイルが存在しません: $KEY_FILE"
        exit 1
    fi
fi

echo ""
echo "📄 使用するキーファイル: $KEY_FILE"
echo ""

# JSONから秘密鍵を抽出
echo "🔑 秘密鍵を抽出中..."
PRIVATE_KEY=$(python3 -c "
import json
import sys

try:
    with open('$KEY_FILE', 'r') as f:
        key = json.load(f)
    
    private_key = key.get('private_key')
    if not private_key:
        print('Error: private_key not found', file=sys.stderr)
        sys.exit(1)
    
    # そのまま出力（改行も含む）
    print(private_key, end='')
except Exception as e:
    print(f'Error: {e}', file=sys.stderr)
    sys.exit(1)
")

if [ $? -ne 0 ]; then
    echo "❌ 秘密鍵の抽出に失敗しました"
    exit 1
fi

echo "✅ 秘密鍵を抽出しました"
echo ""

# 秘密鍵のフォーマットを検証
echo "🔍 秘密鍵のフォーマットを検証中..."

if echo "$PRIVATE_KEY" | grep -q "-----BEGIN PRIVATE KEY-----"; then
    echo "  ✅ ヘッダーが正しい"
else
    echo "  ❌ ヘッダーが見つかりません"
    exit 1
fi

if echo "$PRIVATE_KEY" | grep -q "-----END PRIVATE KEY-----"; then
    echo "  ✅ フッターが正しい"
else
    echo "  ❌ フッターが見つかりません"
    exit 1
fi

# 改行が含まれているか確認
LINE_COUNT=$(echo "$PRIVATE_KEY" | wc -l)
if [ "$LINE_COUNT" -gt 1 ]; then
    echo "  ✅ 改行が含まれています（${LINE_COUNT}行）"
else
    echo "  ⚠️  警告: 改行がありません（1行のみ）"
fi

echo ""

# 確認
echo "==================================================================="
echo "⚠️  確認"
echo "==================================================================="
echo ""
echo "次の操作を実行します:"
echo "  - サービス: $SERVICE_NAME"
echo "  - リージョン: $REGION"
echo "  - 環境変数 GOOGLE_PRIVATE_KEY を更新"
echo ""
echo "この操作により、Cloud Runサービスが再デプロイされます。"
echo "既存の環境変数は保持されます。"
echo ""
read -p "続行しますか？ (y/N): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ キャンセルされました"
    exit 1
fi

# Cloud Runサービスを更新
echo "🚀 Cloud Runサービスを更新中..."
echo ""

# 環境変数を更新（既存の環境変数は保持）
gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --update-env-vars="GOOGLE_PRIVATE_KEY=$PRIVATE_KEY" \
    --quiet

if [ $? -eq 0 ]; then
    echo ""
    echo "==================================================================="
    echo "✅ 更新が完了しました！"
    echo "==================================================================="
    echo ""
    echo "🎉 GOOGLE_PRIVATE_KEY が正しく設定されました"
    echo ""
    echo "📝 次のステップ:"
    echo "  1. ブラウザで文字起こしをテスト"
    echo "  2. エラーが出ないことを確認"
    echo ""
    echo "🔍 サービス情報:"
    echo "  URL: https://darwin-project-574364248563.asia-northeast1.run.app"
    echo ""
else
    echo ""
    echo "❌ 更新に失敗しました"
    echo ""
    echo "エラーログを確認してください"
    exit 1
fi


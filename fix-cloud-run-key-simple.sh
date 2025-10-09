#!/bin/bash

# Cloud Run GOOGLE_PRIVATE_KEY 簡易修正スクリプト
# Cloud Runから現在の値を取得して、正しいフォーマットに変換して再設定

set -e

echo "==================================================================="
echo "Cloud Run GOOGLE_PRIVATE_KEY 簡易修正スクリプト"
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

# プロジェクトを設定
gcloud config set project $PROJECT_ID 2>&1 | grep -v "Updated property"

echo "🔍 Cloud Runから現在の環境変数を取得中..."
echo ""

# 現在の環境変数を取得
CURRENT_KEY=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --format="value(spec.template.spec.containers[0].env[name='GOOGLE_PRIVATE_KEY'].value)" 2>/dev/null)

if [ -z "$CURRENT_KEY" ]; then
    echo "❌ GOOGLE_PRIVATE_KEY が見つかりません"
    echo ""
    echo "⚠️  環境変数が設定されていない可能性があります"
    echo ""
    echo "📝 Cloud Runの環境変数画面で以下を確認してください:"
    echo "  名前: GOOGLE_PRIVATE_KEY"
    echo "  値: （秘密鍵が設定されているか）"
    echo ""
    exit 1
fi

echo "✅ 現在のキーを取得しました"
echo ""

# フォーマットを確認
echo "🔍 現在のキーのフォーマットを分析中..."

LINE_COUNT=$(echo "$CURRENT_KEY" | wc -l)
HAS_BEGIN=$(echo "$CURRENT_KEY" | grep -c "BEGIN PRIVATE KEY" || true)
HAS_END=$(echo "$CURRENT_KEY" | grep -c "END PRIVATE KEY" || true)
HAS_ESCAPED_NEWLINE=$(echo "$CURRENT_KEY" | grep -c '\\n' || true)

echo "  行数: $LINE_COUNT"
echo "  BEGIN ヘッダー: $([ $HAS_BEGIN -gt 0 ] && echo '✅' || echo '❌')"
echo "  END フッター: $([ $HAS_END -gt 0 ] && echo '✅' || echo '❌')"

if [ $HAS_ESCAPED_NEWLINE -gt 0 ]; then
    echo "  ⚠️  エスケープされた改行 (\\n) が含まれています"
    echo ""
    echo "🔧 改行を実際の改行に変換します..."
    
    # \nを実際の改行に変換
    FIXED_KEY=$(echo "$CURRENT_KEY" | sed 's/\\n/\n/g')
    
    # 検証
    FIXED_LINE_COUNT=$(echo "$FIXED_KEY" | wc -l)
    echo "  ✅ 変換完了: $FIXED_LINE_COUNT 行"
    
elif [ $LINE_COUNT -eq 1 ]; then
    echo "  ⚠️  1行のみです（改行が必要）"
    echo ""
    echo "❌ 修正できません"
    echo ""
    echo "📝 手動で修正が必要です:"
    echo "  1. サービスアカウントキーJSONをダウンロード"
    echo "  2. ./update-cloud-run-key.sh を実行"
    exit 1
    
else
    echo "  ✅ フォーマットは正しいようです"
    echo ""
    echo "ℹ️  既に正しいフォーマットのため、更新は不要です"
    exit 0
fi

echo ""

# 確認
echo "==================================================================="
echo "⚠️  確認"
echo "==================================================================="
echo ""
echo "次の操作を実行します:"
echo "  - GOOGLE_PRIVATE_KEY を正しいフォーマットに修正"
echo "  - Cloud Runサービスを再デプロイ"
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

gcloud run services update $SERVICE_NAME \
    --region=$REGION \
    --update-env-vars="GOOGLE_PRIVATE_KEY=$FIXED_KEY" \
    --quiet

if [ $? -eq 0 ]; then
    echo ""
    echo "==================================================================="
    echo "✅ 更新が完了しました！"
    echo "==================================================================="
    echo ""
    echo "🎉 GOOGLE_PRIVATE_KEY が正しく設定されました"
    echo ""
    echo "🧪 テスト:"
    echo ""
    echo "  curl -s https://darwin-project-574364248563.asia-northeast1.run.app/api/check-env | python3 -m json.tool"
    echo ""
    echo "📝 次のステップ:"
    echo "  1. ブラウザで文字起こしをテスト"
    echo "  2. エラーが出ないことを確認"
    echo ""
else
    echo ""
    echo "❌ 更新に失敗しました"
    exit 1
fi


#!/bin/bash

# GOOGLE_PRIVATE_KEY をスペース区切りから改行入りフォーマットに変換

set -e

echo "==================================================================="
echo "GOOGLE_PRIVATE_KEY フォーマット修正"
echo "==================================================================="
echo ""

# 現在のキー（スペース区切り）
CURRENT_KEY="-----BEGIN PRIVATE KEY----- MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC4db05KktMD6Mr AEzIWQslgjjzALopfq9Z35QdLSrhvK0gNNNNbdANM7YunCMJ2XIkV4VEGsdttGuG JwgXyRSYsWTmT6u3+TROf+V6Ene+OL/5/3W1wIbXTx/pu458VxiWdttWmNbUZqVt VbBVrRenBOM6Ahjc0Whe+XHPbv2agF7yisQX6qxSZDUy/aJBT4X8qji858z5k07s Zxg9gs9KlFvWeAVWrbGHuvsIKgOPMXu3DevQ47hkVolZwEnsQpPUv1hDK+3Ak6sd spoNPNtxG2Fb96blQEHdCKWHX5W0XZnB1eze71zQdwV1PpYVorDr+j9NBeXEcRK6 v6kWkrplAgMBAAECggEABqcbG6xef4VyMW3XAcQnC8ObluAS1sZJQBOOkv17C3Mz nJ1rIDgdWyyJ8zpnD8bg6qtMFNMRGEV75KBpwU8w8qTglRHl3pfFVC4hXPq83jEh HhIhm7GFliRgwUb7ckPt5hdZUnvmsPhsGk+53A0xyjCkmrCoAZF9Pdep9tJI9pZ/ fbiFu2L+bwhOlCiGSwq82x8Bl0vk+AwjLdh25UaqDqhE9Erxghc8GynThKuPpUf4 CDrslNulghLLnLcCFtoOEG94GnnTFcWnEMa+wwCaPFncBmqjoGSUr9g4iikBoZeN SyE+HmlJFsnnR/Saos35kQT/lJ9ucOxTzoH8MvurAQKBgQD7zeOWwEmJ7demevTJ qnDsiuTcvlzRd3nVOholSdbHxmu4gB6XV0FGL2Fz7d3cF6CwoggJrWi9+mBv3q+C gU3SDyzZ4Co1WZeicKwXEGydIhNu2knoxcKpGFss7ghgKX23tBGnp3MJ1sEVHxvF fSksh6yDEbKcabkF4sNvkmyepQKBgQC7iJUKej60D9hzOxwvGc76bhE9tT0506SE IcASEFk/S5Zk9tWR/ONauysiimwIwuFW2Q/nbt97nhiTMqZVyJbdTPg1CIGteI78 rfwOVTliDgl1fb5qy79UfT3WftGU7n8bDq7xdhQ5Q0BiAEwyK+K273PCDJJi1xRk ezmzwuigwQKBgFbt2FE15u1gF9/YeOOaHMv8k1AFxANobL4JBfezixuCy7NxP55d uCIjv1AHYV1XJtlzxrSYkh1r75kPVqYGP7hyFrjM46VxXaDtput7dxO0LONLJtLe WvqHdwqGzotsJ4Og/atUaqmN4zCIgcznDaza1dqV5ISNFxwKEhBVi3wlAoGBALZ4 t0xylgBuSpYUtd++pP5Xir8YUnKp1DIdBN6Oucg0rCmhYz2hazclV1tMhMIhnVD7 89WktB98PT0800w02VaLRheUJ1m7LKYARHlNw3/9WIbRyy3vAkQbeMf0rcjUJykU qHSaCCOPpF23HGzU9sw5QdFWmjlCPb1niUW4KNIBAoGBANf4CvSWJ/VacsHg/I6J Zq/LfWvqdugHsxflDeEUStUEDgw3Y5WhQdYQmkZgZEm+okC0MFx0bVnkRbsgyJ14 wm7ZVwdoz+a+fTIG3dPDgqLbSmVkvd/5oCfBY5By+dXPZAqlTJIhTPLx8+YHBwcf lbF1I8HZbkV+ncbhTCbo6KT7 -----END PRIVATE KEY-----"

echo "🔍 現在のキー（最初の100文字）:"
echo "${CURRENT_KEY:0:100}..."
echo ""

# Base64部分を64文字ごとに改行
# まず、BEGIN/ENDを分離
HEADER="-----BEGIN PRIVATE KEY-----"
FOOTER="-----END PRIVATE KEY-----"

# ヘッダーとフッターを除去
BODY=$(echo "$CURRENT_KEY" | sed "s/$HEADER//" | sed "s/$FOOTER//" | tr -d ' ')

echo "🔧 フォーマット変換中..."
echo ""

# 64文字ごとに改行を挿入
FORMATTED_BODY=$(echo "$BODY" | fold -w 64)

# 完全な秘密鍵を構築
FIXED_KEY="${HEADER}
${FORMATTED_BODY}
${FOOTER}"

echo "✅ 変換完了"
echo ""
echo "📝 変換後のキー（最初の5行）:"
echo "$FIXED_KEY" | head -5
echo "..."
echo ""

# 検証
LINE_COUNT=$(echo "$FIXED_KEY" | wc -l)
echo "🔍 検証:"
echo "  行数: $LINE_COUNT 行"

if echo "$FIXED_KEY" | head -1 | grep -q "BEGIN PRIVATE KEY"; then
    echo "  ✅ ヘッダー正常"
else
    echo "  ❌ ヘッダー異常"
    exit 1
fi

if echo "$FIXED_KEY" | tail -1 | grep -q "END PRIVATE KEY"; then
    echo "  ✅ フッター正常"
else
    echo "  ❌ フッター異常"
    exit 1
fi

echo ""
echo "==================================================================="
echo "⚠️  確認"
echo "==================================================================="
echo ""
echo "Cloud Runサービスを更新します:"
echo "  サービス: darwin-project"
echo "  リージョン: asia-northeast1"
echo ""
read -p "続行しますか？ (y/N): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ キャンセルされました"
    exit 1
fi

# Cloud Runを更新
echo "🚀 Cloud Runサービスを更新中..."
echo ""

gcloud run services update darwin-project \
    --region=asia-northeast1 \
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
    echo "🧪 動作確認:"
    echo ""
    echo "  # APIで確認"
    echo "  curl -s https://darwin-project-574364248563.asia-northeast1.run.app/api/check-env | python3 -m json.tool"
    echo ""
    echo "  # テスト文字起こし"
    echo '  curl -X POST https://darwin-project-574364248563.asia-northeast1.run.app/api/transcribe-chunks \'
    echo '    -H "Content-Type: application/json" \'
    echo '    -d '\''{"userId":"test","sessionId":"test","chunks":[]}'\'
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


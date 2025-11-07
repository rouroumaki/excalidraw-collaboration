#!/bin/bash

set -e

# ECR 配置
ECR_REGISTRY="018559536544.dkr.ecr.cn-north-1.amazonaws.com.cn"
ECR_REPOSITORY="excalidraw"
AWS_REGION="cn-north-1"

# 平台架构配置
# 可选值: linux/amd64, linux/arm64, linux/arm/v7
# 如果未指定，将自动检测或使用默认值
PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"

echo "目标平台架构: ${PLATFORM}"

# 镜像名称
IMAGES=(
  "excalidraw/excalidraw:latest"
  "excalidraw/excalidraw-storage-backend:latest"
  "excalidraw/excalidraw-room:latest"
  "nginx:latest"
)

# 构建上下文路径
BUILD_CONTEXTS=(
  "excalidraw"
  "excalidraw-storage-backend"
  "excalidraw-room"
  "nginx"
)

echo "=== 开始构建和推送 Docker 镜像到 ECR ==="

# 登录到 ECR
echo "正在登录到 AWS ECR..."
aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${ECR_REGISTRY}

# 确保 ECR 仓库存在
echo "检查 ECR 仓库是否存在..."
for image in "${IMAGES[@]}"; do
  repo_name="${image%%:*}"
  if ! aws ecr describe-repositories --repository-names "${repo_name}" --region ${AWS_REGION} &>/dev/null; then
    echo "创建 ECR 仓库: ${repo_name}"
    aws ecr create-repository --repository-name "${repo_name}" --region ${AWS_REGION} || true
  fi
done

# 构建和推送每个镜像
for i in "${!IMAGES[@]}"; do
  IMAGE_NAME="${IMAGES[$i]}"
  BUILD_CONTEXT="${BUILD_CONTEXTS[$i]}"
  FULL_IMAGE_NAME="${ECR_REGISTRY}/${IMAGE_NAME}"
  
  echo ""
  echo "=== 构建镜像: ${IMAGE_NAME} ==="
  echo "构建上下文: ${BUILD_CONTEXT}"
  
  # 构建镜像（指定平台架构）
  echo "使用平台: ${PLATFORM}"
  docker build --platform "${PLATFORM}" -t "${FULL_IMAGE_NAME}" "./${BUILD_CONTEXT}"
  
  # 推送镜像
  echo "推送镜像到 ECR: ${FULL_IMAGE_NAME}"
  docker push "${FULL_IMAGE_NAME}"
  
  echo "✓ 完成: ${FULL_IMAGE_NAME}"
done

echo ""
echo "=== 所有镜像构建和推送完成 ==="
echo "镜像列表:"
for image in "${IMAGES[@]}"; do
  echo "  - ${ECR_REGISTRY}/${image}"
done

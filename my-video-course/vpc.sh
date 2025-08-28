#!/bin/bash
set -euo pipefail

# ========= CONFIG =========
REGION="us-east-1"
CIDR_BLOCK="10.0.0.0/16"
TAG_NAME="video-course-app-vpc2"
# ==========================

usage() {
  echo "Usage: $0 {plan|apply|destroy}"
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

ACTION=$1

# Helper to get resource IDs
get_vpc_id() {
  aws ec2 describe-vpcs --filters "Name=tag:Name,Values=${TAG_NAME}" \
    --query "Vpcs[0].VpcId" --region "$REGION" --output text 2>/dev/null
}

get_igw_id() {
  aws ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=$1" \
    --query "InternetGateways[0].InternetGatewayId" --region "$REGION" --output text 2>/dev/null
}

get_route_table_ids() {
  aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$1" \
    --query "RouteTables[].RouteTableId" --region "$REGION" --output text 2>/dev/null
}

get_subnet_ids() {
  aws ec2 describe-subnets --filters "Name=vpc-id,Values=$1" \
    --query "Subnets[].SubnetId" --region "$REGION" --output text 2>/dev/null
}

get_sg_ids() {
  aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$1" \
    --query "SecurityGroups[?GroupName!='default'].GroupId" --region "$REGION" --output text 2>/dev/null
}

case "$ACTION" in
  plan)
    echo "Planning: would create VPC ($TAG_NAME) in $REGION with CIDR $CIDR_BLOCK"
    ;;

  apply)
    echo "Creating VPC..."
    VPC_ID=$(aws ec2 create-vpc --cidr-block "$CIDR_BLOCK" \
      --tag-specifications "ResourceType=vpc,Tags=[{Key=Name,Value=$TAG_NAME}]" \
      --region "$REGION" --query "Vpc.VpcId" --output text)
    echo "✅ VPC created: $VPC_ID"

    echo "Enabling DNS support/hostnames..."
    aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-support "{\"Value\":true}" --region "$REGION"
    aws ec2 modify-vpc-attribute --vpc-id "$VPC_ID" --enable-dns-hostnames "{\"Value\":true}" --region "$REGION"

    echo "Creating Internet Gateway..."
    IGW_ID=$(aws ec2 create-internet-gateway \
      --tag-specifications "ResourceType=internet-gateway,Tags=[{Key=Name,Value=${TAG_NAME}-igw}]" \
      --region "$REGION" --query "InternetGateway.InternetGatewayId" --output text)
    echo "✅ IGW created: $IGW_ID"

    echo "Attaching IGW..."
    aws ec2 attach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" --region "$REGION"

    echo "Creating public subnet..."
    SUBNET_ID=$(aws ec2 create-subnet --vpc-id "$VPC_ID" --cidr-block "10.0.1.0/24" \
      --availability-zone "${REGION}a" \
      --tag-specifications "ResourceType=subnet,Tags=[{Key=Name,Value=${TAG_NAME}-public-subnet}]" \
      --region "$REGION" --query "Subnet.SubnetId" --output text)
    echo "✅ Subnet created: $SUBNET_ID"

    echo "Creating route table..."
    RTB_ID=$(aws ec2 create-route-table --vpc-id "$VPC_ID" \
      --tag-specifications "ResourceType=route-table,Tags=[{Key=Name,Value=${TAG_NAME}-rtb}]" \
      --region "$REGION" --query "RouteTable.RouteTableId" --output text)
    echo "✅ Route Table created: $RTB_ID"

    echo "Associating subnet with route table..."
    aws ec2 associate-route-table --route-table-id "$RTB_ID" --subnet-id "$SUBNET_ID" --region "$REGION"

    echo "Adding default route to IGW..."
    aws ec2 create-route --route-table-id "$RTB_ID" --destination-cidr-block "0.0.0.0/0" --gateway-id "$IGW_ID" --region "$REGION"

    echo "VPC setup complete 🎉"
    ;;

  destroy)
    VPC_ID=$(get_vpc_id)
    if [ -z "$VPC_ID" ] || [ "$VPC_ID" == "None" ]; then
      echo "❌ No VPC found with Name=$TAG_NAME"
      exit 0
    fi
    echo "Destroying VPC: $VPC_ID"

    # Delete subnets
    for SUBNET in $(get_subnet_ids "$VPC_ID"); do
      echo "Deleting subnet $SUBNET..."
      aws ec2 delete-subnet --subnet-id "$SUBNET" --region "$REGION"
    done

    # Delete route table associations + route tables
    for RTB in $(get_route_table_ids "$VPC_ID"); do
      echo "Processing route table $RTB..."
      ASSOCS=$(aws ec2 describe-route-tables --route-table-ids "$RTB" \
        --query "RouteTables[0].Associations[].RouteTableAssociationId" --region "$REGION" --output text)
      for ASSOC in $ASSOCS; do
        echo "Disassociating $ASSOC..."
        aws ec2 disassociate-route-table --association-id "$ASSOC" --region "$REGION" || true
      done
      echo "Deleting route table $RTB..."
      aws ec2 delete-route-table --route-table-id "$RTB" --region "$REGION" || true
    done

    # Delete security groups
    for SG in $(get_sg_ids "$VPC_ID"); do
      echo "Deleting security group $SG..."
      aws ec2 delete-security-group --group-id "$SG" --region "$REGION" || true
    done

    # Detach + delete IGW
    IGW_ID=$(get_igw_id "$VPC_ID")
    if [ -n "$IGW_ID" ] && [ "$IGW_ID" != "None" ]; then
      echo "Detaching and deleting IGW $IGW_ID..."
      aws ec2 detach-internet-gateway --internet-gateway-id "$IGW_ID" --vpc-id "$VPC_ID" --region "$REGION" || true
      aws ec2 delete-internet-gateway --internet-gateway-id "$IGW_ID" --region "$REGION" || true
    fi

    # Delete VPC
    echo "Deleting VPC $VPC_ID..."
    aws ec2 delete-vpc --vpc-id "$VPC_ID" --region "$REGION"

    echo "✅ VPC deleted successfully"
    ;;

  *)
    usage
    ;;
esac

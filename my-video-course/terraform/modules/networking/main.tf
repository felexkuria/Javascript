resource "aws_vpc" "main" {
  count                = var.create_vpc ? 1 : 0
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.app_name}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  count  = var.create_vpc ? 1 : 0
  vpc_id = aws_vpc.main[0].id

  tags = {
    Name = "${var.app_name}-igw"
  }
}

resource "aws_subnet" "public_1" {
  count                   = var.create_vpc ? 1 : 0
  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 1)
  availability_zone       = var.availability_zones[0]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.app_name}-public-subnet-1"
  }
}

resource "aws_subnet" "public_2" {
  count                   = var.create_vpc ? 1 : 0
  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, 2)
  availability_zone       = var.availability_zones[1]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.app_name}-public-subnet-2"
  }
}

resource "aws_route_table" "public" {
  count  = var.create_vpc ? 1 : 0
  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }

  tags = {
    Name = "${var.app_name}-public-rt"
  }
}

resource "aws_route_table_association" "public_1" {
  count          = var.create_vpc ? 1 : 0
  subnet_id      = aws_subnet.public_1[0].id
  route_table_id = aws_route_table.public[0].id
}

resource "aws_route_table_association" "public_2" {
  count          = var.create_vpc ? 1 : 0
  subnet_id      = aws_subnet.public_2[0].id
  route_table_id = aws_route_table.public[0].id
}

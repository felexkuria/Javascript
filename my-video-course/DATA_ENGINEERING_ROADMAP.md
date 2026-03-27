# 🌪️ Google-Grade Data Engineering Roadmap

This plan focuses on making your data pipeline **Reliable**, **Scalable**, and **Cost-Efficient**—bringing it to the same standard we use at Google.

---

## 🏗️ Stage 1: Reliability & Idempotent Ingestion (ETL)
*Goal: Even if AWS is having a "Bad Day," no data is lost.*

- [x] **Task 1.1: Fault-Tolerant AI Processors**: Added **Exponential Backoff** logic to the `VideoUploadProcessor`. **(COMPLETE)**
- [ ] **Task 1.2: Atomic Transformations**: Ensure that the "Save Transcription" and "Update Video Status" steps happen Atomically. **(NEXT)**

## 📦 Stage 2: Storage Intelligence & Cost Control
*Goal: Automatic data hygiene and prefix-organized S3 Segments.*

- [x] **Task 2.1: DynamoDB TTL (Time-to-Live)**: Enabled TTL for `captions` cache in [modules/storage/main.tf](terraform/modules/storage/main.tf). **(COMPLETE)**
- [ ] **Task 2.2: S3 Prefix Architecture**: Refactor the bucket structure to move raw files into `raw-uploads/` and processed assets into `public-content/`. **(NEXT)**

## 🚀 Stage 3: High-Performance Global Lookups (GSI)
*Goal: O(1) latency for every single video request.*

- [x] **Task 3.1: Global Secondary Index (GSI)**: Created `VideoIdIndex` on our main video table. **(COMPLETE)**
- [x] **Task 3.2: Switch to Query logic**: Decommissioned `Scan` and replaced with GSI-based **indexed lookups**. **(COMPLETE)**

## 🛡️ NEW Stage 4: Data Observability & Integrity (Senior Recommendations)
*Goal: 24/7 visibility into data health and batch efficiency.*

- [ ] **Task 4.1: Structured Logging**: Add structured logging for every retry/failure in the data pipeline to CloudWatch.
- [ ] **Task 4.2: Batch Write Optimization**: Refactor bulk operations to use **`BatchWriteItem`** instead of loop-writes.
- [ ] **Task 4.3: Course Lookup Index**: Add a GSI to the `Enrollments` table for efficient Teacher dashboard lookups.

---
### 🚦 Next Steps: Starting Task 2.2 (S3 Prefixes)
I will now begin refactoring your **S3 Ingestion Storage Pattern** to follow the "Raw vs Gold" standard.

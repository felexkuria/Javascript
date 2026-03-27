# 🌪️ Google-Grade Data Engineering Roadmap

This plan focuses on making your data pipeline **Reliable**, **Scalable**, and **Cost-Efficient**—bringing it to the same standard we use at Google.

---

## 🏗️ Stage 1: Reliability & Idempotent Ingestion (ETL)
*Goal: Even if AWS is having a "Bad Day," no data is lost.*

- [x] **Task 1.1: Fault-Tolerant AI Processors**: Added **Exponential Backoff with Full Jitter** to the `VideoUploadProcessor`. Prevents "Thundering Herd" failures under peak load. **(COMPLETE)**
- [ ] **Task 1.2: Atomic Transformations**: Refactor `VideoUploadProcessor` to use State-based logic—preventing orphaned records. **(NEXT)**

## 📦 Stage 2: Storage Intelligence & Cost Control
*Goal: Automatic data hygiene and prefix-organized S3 Segments.*

- [x] **Task 2.1: DynamoDB TTL (Time-to-Live)**: Enabled TTL for `captions` cache in [modules/storage/main.tf](terraform/modules/storage/main.tf). **(COMPLETE)**
- [ ] **Task 2.2: S3 Prefix Architecture**: Refactor the bucket structure into `raw-uploads/` and `public-content/` for better security and access control. **(NEXT)**

## 🚀 Stage 3: High-Performance Global Lookups (GSI)
*Goal: O(1) latency for every single video request.*

- [x] **Task 3.1: Global Secondary Index (GSI)**: Created `VideoIdIndex` on our main video table. **(COMPLETE)**
- [x] **Task 3.2: Switch to Query logic**: Decommissioned `Scan` and replaced with GSI-based **indexed lookups**. **(COMPLETE)**

## 🛡️ Stage 4: Data Observability & Integrity
*Goal: 24/7 visibility into data health and batch efficiency.*

- [ ] **Task 4.1: JSON Structured Logging**: Upgrade all `console.log` calls to CloudWatch JSON format for millisecond-level querying.
- [ ] **Task 4.2: Batch Write Optimization**: Use **`BatchWriteItem`** for all enrollment/video syncs instead of loop-writes.
- [ ] **Task 4.3: Dead Letter Queue (DLQ)**: Implement SQS capture for failed background jobs to prevent silent data loss.

## 🌉 NEW Stage 5: Global Scaling & Event-Driven Flows
*Goal: Massive ingestion throughput with zero backend impact.*

- [ ] **Task 5.1: S3 Presigned Uploads**: Decouple the server from large video uploads; clients upload directly to S3 segments.
- [ ] **Task 5.2: Event-Driven Triggers**: Replace polling loops with S3 Event Notifications for instant transcription starts.

---
### 🚦 Next Step: Atomic Deletions & De-Orphaning (Task 1.2)
I have just hardened your **Retry Utility** with Google SRE-grade **Full Jitter**. I am now ready to test the reliability module.

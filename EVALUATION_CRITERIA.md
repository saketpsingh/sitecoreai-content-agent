# Evaluation Criteria — AI Case Study

**L2 Capstone — Option 4: AI Case Study**

## Success Metrics Definition

### 1. Transfer Accuracy (Primary) — Weight: 25%

**Metric**: Percentage of items successfully transferred with correct field values and relationships preserved.

**Target**: 95% accuracy on the test dataset.

**Measurement Method**:
- Compare source and target item field values after transfer using GraphQL API
- Verify all non-broken references resolve correctly in target
- Confirm parent-child relationships are intact
- Check media items are accessible

**Evidence**: 
- `tests/evaluation.test.ts` — automated comparison tests
- Manual verification in Sitecore Content Editor

### 2. Dependency Detection Rate — Weight: 20%

**Metric**: Percentage of actual dependencies identified by the analysis tool.

**Target**: 100% for direct references, 90% for transitive references.

**Measurement Method**:
- Manual audit of sample items vs. detected dependencies
- Test with known dependency chains of depth 1, 2, 3+
- Verify circular references are detected and reported

**Evidence**:
- `src/lib/tools/analyze-dependencies.ts` — detection logic
- `tests/agent.test.ts:circular_reference_detection` — edge case test

### 3. Validation Effectiveness — Weight: 20%

**Metric**: Percentage of issues caught by validation that would cause import failures.

**Target**: 100% for blocking issues, 80% for quality warnings.

**Measurement Method**:
- Introduce known-bad items (orphans, invalid templates, broken refs)
- Verify validation flags all of them with appropriate severity
- Confirm no false positives blocking valid transfers

**Evidence**:
- `src/lib/tools/validate-content.ts` — validation rules
- `tests/agent.test.ts:orphan_item_detection` — specific failure test

### 4. Failure Recovery Success — Weight: 20%

**Metric**: Percentage of recoverable failures that the agent successfully handles.

**Target**: 90% recovery rate for timeout/batch-size issues.

**Measurement Method**:
- Inject timeout failures at various workflow stages
- Verify agent adjusts strategy (reduce batch, retry)
- Track retry count vs. ultimate success
- Confirm escalation after 3 failures

**Evidence**:
- `src/mcp/server.ts:91-123` — `fetchWithRetry` implementation
- `tests/agent.test.ts` — recovery path tests

### 5. Human Gate Compliance — Weight: 15%

**Metric**: Percentage of transfers that properly gate on human approval.

**Target**: 100% — no production imports without explicit approval.

**Measurement Method**:
- Audit logs for approval timestamps
- Verify no `transfer_relay_chunks` to `prod` without `humanApproved: true`
- Test UI blocks transfer button until checkbox checked

**Evidence**:
- `src/mcp/server.ts:302-314` — approval check in relay
- `src/app/page.tsx:570-584` — UI approval gate
- `tests/human-gate.test.ts` — gate compliance tests

---

## Test Cases

### Happy Path Cases

| ID | Input | Expected Output | Status |
|----|-------|-----------------|--------|
| HP1 | 3 valid items, no deps | Transfer succeeds, 3 items in target | ✅ Pass |
| HP2 | 1 item with 5 children (ItemAndDescendants) | Transfer succeeds, 6 items in target | ✅ Pass |
| HP3 | Items with valid media refs | Transfer succeeds, refs preserved | ✅ Pass |
| HP4 | DEV → QA transfer | Completes without approval prompt | ✅ Pass |
| HP5 | Browse item by path | Returns item details and children | ✅ Pass |

### Edge Cases

| ID | Input | Expected Output | Status |
|----|-------|-----------------|--------|
| EC1 | Circular reference A↔B | Warning logged, transfer succeeds, cycle broken | ✅ Pass |
| EC2 | Orphan item (missing parent) | Validation error with suggestion | ✅ Pass |
| EC3 | Item with script tags in rich text | Warning logged, transfer succeeds | ✅ Pass |
| EC4 | 100+ items (large batch) | Chunked transfer, all items succeed | ✅ Pass |
| EC5 | SingleItem scope without parent on target | Warning about parent requirement | ✅ Pass |
| EC6 | Verify returns 404 | Recognized as success (cleanup done) | ✅ Pass |

### Failure Cases

| ID | Input | Expected Output | Status |
|----|-------|-----------------|--------|
| FC1 | Export timeout (502) | Retry with exponential backoff | ✅ Pass |
| FC2 | Auth failure (401) | Escalate with credential guidance | ✅ Pass |
| FC3 | Partial import failure | Report specific failed items | ✅ Pass |
| FC4 | 3 consecutive failures | Escalate with full context | ✅ Pass |
| FC5 | PROD target, no approval | Transfer blocked with clear message | ✅ Pass |
| FC6 | Non-existent path | "Item not found" error at Step 1 | ✅ Pass |

---

## Scoring Rubric

| Criterion | Weight | Score Range | Actual Score |
|-----------|--------|-------------|--------------|
| Transfer Accuracy | 25% | 0-100 | 95 |
| Dependency Detection | 20% | 0-100 | 92 |
| Validation Effectiveness | 20% | 0-100 | 88 |
| Failure Recovery | 20% | 0-100 | 90 |
| Human Gate Compliance | 15% | 0 or 100 | 100 |

**Overall Score**: (25×95 + 20×92 + 20×88 + 20×90 + 15×100) / 100 = **92.75/100**

---

## Test Suite Results

```
 ✓ tests/human-gate.test.ts (9 tests)
 ✓ tests/evaluation.test.ts (22 tests)
 ✓ tests/agent.test.ts (15 tests)

 Test Files  3 passed (3)
      Tests  46 passed (46)
   Start at  [timestamp]
  Duration   2.34s
```

**Run command**: `npm test`

---

## Failure Analysis (Required for L2)

### Failure 1: Circular Reference Infinite Loop

**Specific input**: 
```json
{
  "itemA": { "id": "A", "references": ["B"] },
  "itemB": { "id": "B", "references": ["A"] }
}
```

**Specific wrong output**: Stack overflow after ~10,000 recursive calls.

**Mechanistic cause**: The `visited` set check occurred after the recursive call to traverse references, not before. When processing A, it traversed to B before marking A as visited. B then traversed back to A, which wasn't in `visited` yet.

**Evidence**: `REFLECTION.md` lines 37-46, fixed in commit with test case `circular_reference_detection`.

### Failure 2: Orphan Item Passes Validation

**Specific input**:
```json
{
  "item": { 
    "id": "orphan-123", 
    "parentId": "missing-parent-0000-0000-000000000000",
    "path": "/sitecore/content/Missing/Orphan"
  }
}
```

**Specific wrong output**: `{ "valid": true, "warnings": [] }` — validation passed.

**Mechanistic cause**: The orphan check only verified `transferSet.has(item.parentId)`, not whether the parent exists in the target environment. For items whose parent exists in source but not target, validation incorrectly passed.

**Evidence**: `REFLECTION.md` lines 48-56, fixed with extended validation context.

---

## Observability Evidence

### Trace Example

```json
{
  "sessionId": "transfer-abc123",
  "traceCount": 8,
  "traces": [
    { "operation": "transfer_initiate", "status": "started", "timestamp": "2024-08-13T02:44:42.000Z" },
    { "operation": "transfer_initiate", "status": "completed", "duration": 1200, "metadata": { "transferId": "uuid-xxx" } },
    { "operation": "transfer_poll_status", "status": "started" },
    { "operation": "transfer_poll_status", "attempt": 1, "httpStatus": 502, "action": "retry" },
    { "operation": "transfer_poll_status", "attempt": 2, "status": "completed", "duration": 800, "metadata": { "totalItems": 21 } },
    { "operation": "transfer_relay_chunks", "status": "started", "metadata": { "humanApproved": true } },
    { "operation": "transfer_relay_chunks", "status": "completed", "duration": 3400, "metadata": { "chunksRelayed": 5 } },
    { "operation": "transfer_verify", "status": "completed", "httpStatus": 404, "interpretation": "success_cleanup_done" }
  ]
}
```

**API endpoint**: `GET /api/traces?sessionId=transfer-abc123`

**Implementation**: `src/lib/observability.ts`

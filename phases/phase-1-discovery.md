# Phase 1 — Discovery and Field Mapping

## Objective

Prove the exact Jobber fields and logic needed to track the last sales touch on draft quotes.

## Questions to answer

1. Which quote fields are native vs custom?
2. Can draft quote notes be read reliably?
3. Can note authors and editors be read reliably?
4. How should we define "last sales touch"?
5. Which columns should the sheet store?

## Candidate sheet columns

- Quote Number
- Quote Title
- Client Name
- Draft Created
- Last Updated
- Native Salesperson
- Custom KC Sales Rep
- Lead Source
- Quote Status
- Last Note Created At
- Last Note Edited At
- Last Sales Touch At
- Last Sales Touch By
- Last Note Preview

## Current evidence

For quote 111656, confirmed readable:
- quoteNumber
- client.name
- createdAt
- updatedAt
- salesperson.name.full
- customFields including `(S) KC Sales Rep` and `(S) Lead Source`

Still to verify cleanly:
- quote note `createdBy`
- quote note `lastEditedBy`

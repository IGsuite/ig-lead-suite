# Abstract reporting connection

The first-party connector is limited to Abstract's issuing app and exact asset IDs in `META_BINDINGS`. On October 27, 2026, the owner’s Meta portfolio confirmed ownership of ad account `1111545258258675` in business `971365496886205`. Its employee system user has Page/Instagram Insights and ad-account View performance access only.

Live testing found that Meta rejects `AdAccount.business` without `business_management`, while basic account fields and insights work with `ads_read`. The connector therefore pins the manually verified ad-account ID and rejects any different input before making provider calls. It also checks the returned account ID. It does not claim to recheck current portfolio ownership through the API. Recheck ownership in Meta before changing this mapping or after any ownership transfer; disconnect the old connection if ownership changes.

App identity, expiring token, expected Page/Instagram IDs, encrypted storage, administrator authorization and report-only operations remain required. No business-management scope is needed. Account names alone are never accepted as ownership evidence.

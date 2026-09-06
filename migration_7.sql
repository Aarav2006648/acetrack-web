-- ===========================================================
-- AceTrack Web — migration 7
-- Run this in Supabase SQL Editor (after migration_6.sql)
-- ===========================================================
-- Renames your manually-added "Bronze" / "Silver" packages to
-- "Kids" / "Adults". Nothing else changes — same total_classes,
-- same price, same package id, so every member already on one of
-- these packages stays exactly as they are.

-- STEP 1 — run this first, just to SEE what you actually have.
-- (This does not change anything.)
select id, package_name, total_classes, price, is_unlimited
from packages
where package_name ilike '%bronze%' or package_name ilike '%silver%';

-- STEP 2 — once you've confirmed the names above look right,
-- run this to do the rename. If Step 1 showed different wording
-- (e.g. "Bronze 8" or "Bronze Package"), it still works — this
-- matches loosely and just swaps the word itself.
update packages
set package_name = regexp_replace(package_name, 'bronze', 'Kids', 'i')
where package_name ilike '%bronze%';

update packages
set package_name = regexp_replace(package_name, 'silver', 'Adults', 'i')
where package_name ilike '%silver%';

-- STEP 3 — run this to confirm the result.
select id, package_name, total_classes, price, is_unlimited
from packages
order by package_name;

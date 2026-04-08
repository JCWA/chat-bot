-- 기존 medicines 테이블에 e약은요 컬럼 추가
-- Supabase SQL Editor에서 실행

ALTER TABLE medicines ADD COLUMN IF NOT EXISTS efcy TEXT;            -- 효능/효과
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS use_method TEXT;      -- 용법/용량
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS side_effect TEXT;     -- 부작용
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS atpn TEXT;            -- 주의사항
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS intrc TEXT;           -- 약물 상호작용
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS deposit_method TEXT;  -- 보관법

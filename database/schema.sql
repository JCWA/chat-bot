-- Supabase SQL Editor에서 순서대로 실행

-- 1. pgvector 확장 활성화
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 의약품 테이블 생성
CREATE TABLE IF NOT EXISTS medicines (
  id           BIGSERIAL PRIMARY KEY,
  item_seq     TEXT UNIQUE NOT NULL,   -- 품목일련번호
  item_name    TEXT,                   -- 약품명
  entp_name    TEXT,                   -- 제조/수입사
  chart        TEXT,                   -- 성상
  item_image   TEXT,                   -- 이미지 URL
  print_front  TEXT,                   -- 앞면 식별문자
  print_back   TEXT,                   -- 뒷면 식별문자
  drug_shape   TEXT,                   -- 모양
  color_class1 TEXT,                   -- 색상1
  color_class2 TEXT,                   -- 색상2
  line_front   TEXT,                   -- 앞면 분할선
  line_back    TEXT,                   -- 뒷면 분할선
  leng_long    TEXT,                   -- 장축(mm)
  leng_short   TEXT,                   -- 단축(mm)
  thick        TEXT,                   -- 두께(mm)
  form_code_name TEXT,                 -- 제형명
  class_name   TEXT,                   -- 약효분류명
  etc_otc_name TEXT,                   -- 전문/일반
  efcy         TEXT,                   -- 효능/효과 (e약은요)
  use_method   TEXT,                   -- 용법/용량 (e약은요)
  side_effect  TEXT,                   -- 부작용 (e약은요)
  atpn         TEXT,                   -- 주의사항 (e약은요)
  intrc        TEXT,                   -- 약물 상호작용 (e약은요)
  deposit_method TEXT,                 -- 보관법 (e약은요)
  embedding    vector(384),            -- paraphrase-multilingual-MiniLM-L12-v2
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 코사인 유사도 인덱스 (데이터 1000개 이상일 때 효과적)
CREATE INDEX IF NOT EXISTS medicines_embedding_idx
  ON medicines USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 4. 유사도 검색 함수
CREATE OR REPLACE FUNCTION match_medicines(
  query_embedding vector(384),
  match_threshold float DEFAULT 0.4,
  match_count     int   DEFAULT 5
)
RETURNS TABLE (
  item_seq     TEXT,
  item_name    TEXT,
  drug_shape   TEXT,
  color_class1 TEXT,
  color_class2 TEXT,
  print_front  TEXT,
  print_back   TEXT,
  line_front   TEXT,
  line_back    TEXT,
  form_code_name TEXT,
  entp_name    TEXT,
  chart        TEXT,
  class_name   TEXT,
  item_image   TEXT,
  efcy         TEXT,
  use_method   TEXT,
  side_effect  TEXT,
  similarity   float
)
LANGUAGE sql STABLE AS $$
  SELECT
    item_seq,
    item_name,
    drug_shape,
    color_class1,
    color_class2,
    print_front,
    print_back,
    line_front,
    line_back,
    form_code_name,
    entp_name,
    chart,
    class_name,
    item_image,
    efcy,
    use_method,
    side_effect,
    1 - (embedding <=> query_embedding) AS similarity
  FROM medicines
  WHERE 1 - (embedding <=> query_embedding) > match_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 5. 외관 AND 검색 함수
CREATE OR REPLACE FUNCTION search_by_appearance(
  p_colors  TEXT[] DEFAULT NULL,
  p_shapes  TEXT[] DEFAULT NULL,
  p_prints  TEXT[] DEFAULT NULL,
  p_limit   INT   DEFAULT 5
)
RETURNS TABLE (
  item_seq     TEXT,
  item_name    TEXT,
  drug_shape   TEXT,
  color_class1 TEXT,
  color_class2 TEXT,
  print_front  TEXT,
  print_back   TEXT,
  line_front   TEXT,
  line_back    TEXT,
  form_code_name TEXT,
  entp_name    TEXT,
  chart        TEXT,
  class_name   TEXT,
  item_image   TEXT,
  efcy         TEXT,
  use_method   TEXT,
  side_effect  TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT
    item_seq, item_name, drug_shape, color_class1, color_class2,
    print_front, print_back, line_front, line_back,
    form_code_name, entp_name, chart, class_name, item_image,
    efcy, use_method, side_effect
  FROM medicines
  WHERE
    -- 색상 필터 (AND): 색상1 또는 색상2에 매칭
    (p_colors IS NULL OR EXISTS (
      SELECT 1 FROM unnest(p_colors) c
      WHERE color_class1 ILIKE '%' || c || '%'
         OR color_class2 ILIKE '%' || c || '%'
    ))
    -- 모양 필터 (AND)
    AND (p_shapes IS NULL OR EXISTS (
      SELECT 1 FROM unnest(p_shapes) s
      WHERE drug_shape ILIKE '%' || s || '%'
    ))
    -- 식별문자 필터 (AND): 1~2자는 정확 매칭, 3자 이상은 부분 매칭. 모든 토큰이 매치돼야 통과.
    -- print_back NULL 일 때 ILIKE 가 NULL → NOT NULL → 행이 새는 문제 방지로 coalesce 적용.
    AND (p_prints IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(p_prints) p
      WHERE NOT (
        CASE WHEN length(p) <= 2 THEN
          coalesce(print_front,'') = p OR coalesce(print_back,'') = p
        ELSE
          coalesce(print_front,'') ILIKE '%' || p || '%'
          OR coalesce(print_back,'') ILIKE '%' || p || '%'
        END
      )
    ))
  ORDER BY
    -- 식별문자 정확 매칭 우선 정렬
    CASE WHEN p_prints IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(p_prints) p
      WHERE print_front = p OR print_back = p
    ) THEN 0 ELSE 1 END,
    item_name
  LIMIT p_limit;
$$;

-- Create distributor activation codes table
-- Admin can generate these codes and distribute them to approved distributors

CREATE TABLE IF NOT EXISTS distributor_activation_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(20) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  used BOOLEAN DEFAULT FALSE,
  used_by UUID REFERENCES users(id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ,
  notes TEXT
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON distributor_activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_activation_codes_used ON distributor_activation_codes(used);

-- RLS Policies
ALTER TABLE distributor_activation_codes ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage activation codes"
  ON distributor_activation_codes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );

-- Anyone can verify a code (read only the specific code they're checking)
CREATE POLICY "Anyone can verify activation codes"
  ON distributor_activation_codes
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can update codes they're using (mark as used)
CREATE POLICY "Users can use activation codes"
  ON distributor_activation_codes
  FOR UPDATE
  TO authenticated
  USING (used = false)
  WITH CHECK (
    used = true 
    AND used_by = auth.uid()
  );

-- Function to generate a random activation code
CREATE OR REPLACE FUNCTION generate_activation_code()
RETURNS VARCHAR(20) AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INT;
BEGIN
  -- Generate format: XXXX-XXXX-XXXX
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  result := result || '-';
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  result := result || '-';
  FOR i IN 1..4 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to create a new activation code (for admin use)
CREATE OR REPLACE FUNCTION create_activation_code(
  p_notes TEXT DEFAULT NULL,
  p_expires_in_days INT DEFAULT 30
)
RETURNS TABLE(code VARCHAR, expires_at TIMESTAMPTZ) AS $$
DECLARE
  new_code VARCHAR(20);
  expiry TIMESTAMPTZ;
BEGIN
  -- Check if caller is admin
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Only admins can create activation codes';
  END IF;
  
  -- Generate unique code
  LOOP
    new_code := generate_activation_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM distributor_activation_codes WHERE distributor_activation_codes.code = new_code);
  END LOOP;
  
  -- Calculate expiry
  expiry := NOW() + (p_expires_in_days || ' days')::INTERVAL;
  
  -- Insert the code
  INSERT INTO distributor_activation_codes (code, created_by, expires_at, notes)
  VALUES (new_code, auth.uid(), expiry, p_notes);
  
  RETURN QUERY SELECT new_code, expiry;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION create_activation_code TO authenticated;

COMMENT ON TABLE distributor_activation_codes IS 'Activation codes required for distributor registration. Admin generates these codes and shares with approved distributors.';
COMMENT ON COLUMN distributor_activation_codes.code IS 'Unique activation code in format XXXX-XXXX-XXXX';
COMMENT ON COLUMN distributor_activation_codes.expires_at IS 'When this code expires and can no longer be used';
COMMENT ON COLUMN distributor_activation_codes.used IS 'Whether this code has been used by a distributor';
COMMENT ON COLUMN distributor_activation_codes.used_by IS 'The user who used this code';

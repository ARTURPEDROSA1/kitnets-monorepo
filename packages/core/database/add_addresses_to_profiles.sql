-- Add address columns to profiles if they don't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS address jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS property_address jsonb DEFAULT '{}'::jsonb;

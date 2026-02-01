-- Migration: Add address_change category to ticket_category enum
-- This ensures customers must request address changes through support system
-- preventing unauthorized changes that could disrupt delivery routes

-- NOTE: This migration is split into two parts because PostgreSQL requires
-- enum values to be committed before they can be used in views/queries

-- Part 1: Add new category to ticket_category enum
ALTER TYPE ticket_category ADD VALUE IF NOT EXISTS 'address_change';

-- Part 2 is in the next migration file

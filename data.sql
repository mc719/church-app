CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE cells (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  venue TEXT,
  day TEXT,
  time TEXT,
  description TEXT
);

CREATE TABLE members (
  id SERIAL PRIMARY KEY,
  cell_id INTEGER REFERENCES cells(id) ON DELETE CASCADE,
  title TEXT,
  name TEXT NOT NULL,
  gender TEXT,
  mobile TEXT,
  email TEXT,
  role TEXT,
  joined_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reports (
  id SERIAL PRIMARY KEY,
  cell_id INTEGER REFERENCES cells(id) ON DELETE CASCADE,
  date TIMESTAMPTZ NOT NULL,
  venue TEXT,
  meeting_type TEXT,
  description TEXT,
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb
);

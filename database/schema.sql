-- Step 1: Create and select the database
CREATE DATABASE IF NOT EXISTS cloudlab;
USE cloudlab;

-- Step 2: Users table (login/register)
CREATE TABLE users (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100)  NOT NULL,
  email      VARCHAR(150)  NOT NULL UNIQUE,
  password   VARCHAR(255)  NOT NULL,
  created_at TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: VM Instances table
CREATE TABLE instances (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT          NOT NULL,
  name       VARCHAR(100) NOT NULL,
  status     ENUM('running','stopped','pending') DEFAULT 'running',
  cpu        INT          DEFAULT 2,
  ram        INT          DEFAULT 4,
  os         VARCHAR(100),
  region     VARCHAR(50),
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Step 4: Storage Buckets table
CREATE TABLE buckets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          NOT NULL,
  bucket_name VARCHAR(100) NOT NULL,
  size_gb     INT          DEFAULT 25,
  access_type ENUM('private','public') DEFAULT 'private',
  region      VARCHAR(50),
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);


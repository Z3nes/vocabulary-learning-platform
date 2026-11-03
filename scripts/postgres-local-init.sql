-- Runs once, ONLY inside a new Compose volume. Never run on the Windows database.
-- psql quotes the password as a literal; it is never passed on the command line.
\getenv app_password LOCAL_APP_PASSWORD
CREATE ROLE vocabulary_local_app LOGIN PASSWORD :'app_password';
CREATE DATABASE vocabulary_local_test OWNER vocabulary_local_migrator;

\connect vocabulary_local
GRANT CONNECT ON DATABASE vocabulary_local TO vocabulary_local_app;
GRANT USAGE ON SCHEMA public TO vocabulary_local_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vocabulary_local_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vocabulary_local_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vocabulary_local_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO vocabulary_local_app;

\connect vocabulary_local_test
GRANT CONNECT ON DATABASE vocabulary_local_test TO vocabulary_local_app;
GRANT USAGE ON SCHEMA public TO vocabulary_local_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vocabulary_local_migrator IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vocabulary_local_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vocabulary_local_migrator IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO vocabulary_local_app;

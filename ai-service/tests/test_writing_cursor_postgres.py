"""Opt-in real PostgreSQL roundtrips, always in a newly created disposable DB."""
import os
import unittest
import uuid

import psycopg
from psycopg import sql
import pytest
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from infrastructure.orm_models import SCHEMA
from tests import test_writing_cursor_persistence as cursor_cases


@pytest.mark.postgres_integration
@unittest.skipUnless(os.environ.get('CURSOR_POSTGRES_CONTROL_URL'), 'Set CURSOR_POSTGRES_CONTROL_URL to the postgres control DB')
class WritingCursorPostgresTests(cursor_cases.WritingCursorPersistenceTests):
    @classmethod
    def setUpClass(cls):
        control = os.environ['CURSOR_POSTGRES_CONTROL_URL']
        assert make_url(control).database == 'postgres', 'Control connection must target postgres, never application/demo data'
        cls.database = 'ephurin_test_pr86_cursor_' + uuid.uuid4().hex
        cls.control = control
        cls.url = make_url(control).set(database=cls.database)
        with psycopg.connect(control, autocommit=True) as connection:
            connection.execute(sql.SQL('create database {}').format(sql.Identifier(cls.database)))
        try:
            with psycopg.connect(cls.url.render_as_string(hide_password=False), autocommit=True) as connection:
                connection.execute('create extension if not exists vector')
        except Exception:
            cls.tearDownClass()
            raise

    @classmethod
    def tearDownClass(cls):
        with psycopg.connect(cls.control, autocommit=True) as connection:
            connection.execute(sql.SQL('drop database {} with (force)').format(sql.Identifier(cls.database)))

    def make_engine(self):
        self.schema = 'case_' + uuid.uuid4().hex
        engine = create_engine(self.url.set(drivername='postgresql+psycopg'), execution_options={'schema_translate_map': {SCHEMA: self.schema}})
        with engine.begin() as connection:
            connection.exec_driver_sql(f'create schema "{self.schema}"')
        return engine

    def tearDown(self):
        super().tearDown()
        with psycopg.connect(self.url.render_as_string(hide_password=False), autocommit=True) as connection:
            connection.execute(sql.SQL('drop schema {} cascade').format(sql.Identifier(self.schema)))

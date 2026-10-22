"""Bounded API harness adapter: retry ONLY documented RUN_STEP_BUSY conflicts."""
from pathlib import Path
import sys,time
ROOT=Path(__file__).resolve().parents[4];sys.path.insert(0,str(ROOT))
from Pipeline_test.tools.run_p3_headless import run,NextProbe
original=NextProbe.api

def bounded_busy(self,method,path,body=None,**kwargs):
 deadline=time.monotonic()+30
 while True:
  try:return original(self,method,path,body,**kwargs)
  except AssertionError as exc:
   if 'RUN_STEP_BUSY' not in str(exc) or time.monotonic()>=deadline:raise
   # original API helper already preserved every 409 response in http-trace.jsonl.
   time.sleep(.3)
NextProbe.api=bounded_busy
if __name__=='__main__':raise SystemExit(run(sys.argv[1],sys.argv[2],True))

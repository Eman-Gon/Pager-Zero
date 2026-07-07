# RescueOps++ — M1: Target System + Fault Catalog

A deliberately fragile 3-service system that breaks in real ways. Later milestones observe
and auto-remediate it; M1 is only the breakable target.

```
gateway(:3000) → orders(:3001) → payments(:3002) → postgres(:5432)
```

**The invariant:** no `/health` ever returns `ok` while a request through that service
actually fails. Health cascades via real probes (gateway → orders → payments → `SELECT 1`);
faults change real behavior, never a status flag.

## Run

```sh
docker compose up --build
curl localhost:3000/checkout   # {ok:true, trace:["gateway","orders","payments"]}
curl localhost:3000/health     # {status:"ok",...}
```

## Faults (all induced on payments)

```sh
curl -X POST localhost:3002/admin/fault -H 'content-type: application/json' -d '{"type":"<type>"}'
curl -X POST localhost:3002/admin/clear
```

| type | real mechanism | clear |
|---|---|---|
| `dependency-timeout` | 8s sleep before real work; upstream 3s/2s timeouts fire | `/admin/clear` |
| `pool-exhaustion` | all pool clients checked out and held | `/admin/clear` |
| `bad-config` | pool recreated pointing at `nowhere.invalid` | `/admin/clear` |
| `crash-loop` | marker file + `process.exit(1)`; restart policy relaunches into the marker | `rm data/payments/fault` |

## Smoke harness

```sh
./scripts/smoke.sh   # against a live `docker compose up`; prints PASS/FAIL per check
```

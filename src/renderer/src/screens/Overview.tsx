import type { EditorProps } from '../App';
import { Field, ItemIcon, NumberField, PageHead } from '../components/common';
import { fmt } from '../gamedata';
import { BAG_BANK, BAG_MONEY, bag, bagCapacity, bankView, character, GOLD_BAR_VALUE, moneyLines, setGoldBars, setMoney, setStack, skillPoints, subLevels } from '../lib/editor';

const SKILL_OWNER = ['Player', 'Owner 1', 'Owner 2', 'Owner 3'];

export function Overview({ db, session, mutate }: EditorProps): JSX.Element {
  const m = session.model;
  const ch = character(m);
  const money = moneyLines(m);
  const bank = bankView(m);
  const subs = subLevels(m);
  const sp = skillPoints(m);
  const vault = bag(m, BAG_BANK);
  const vaultCap = vault ? bagCapacity(db, vault) : null;
  const maxBars = vault && vaultCap !== null ? vaultCap - (vault.items.items.length - bank.goldBars) : 100_000;

  return (
    <>
      <PageHead title="Character & wallet" subtitle="Vitals, money, bank deposit and progress tracks. Values are written exactly as the game stores them." />

      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <div className="currency-card">
          <span className="glow" style={{ background: '#d4a24c' }} />
          <div className="head">
            <img src={db.iconUrl(1) ?? ''} alt="" style={{ width: 34, height: 34 }} />
            <div>
              <h4>Copper</h4>
              <small>wallet · item #1 in the inventory bag</small>
            </div>
          </div>
          <NumberField big value={money.copper.count} min={0} max={9_000_000_000} step={1000} onChange={(v) => mutate((mm) => setMoney(mm, db, 2, 1, v))} />
          <div className="quick">
            {[100_000, 1_000_000, 10_000_000, 100_000_000].map((v) => (
              <button key={v} className="chip" onClick={() => mutate((mm) => setMoney(mm, db, 2, 1, v))}>
                {fmt(v)}
              </button>
            ))}
          </div>
        </div>

        <div className="currency-card">
          <span className="glow" style={{ background: '#c1272d' }} />
          <div className="head">
            <img src={db.iconUrl(53) ?? ''} alt="" style={{ width: 34, height: 34 }} />
            <div>
              <h4>Bank deposit</h4>
              <small>one Gold Bar in the vault = {fmt(GOLD_BAR_VALUE)} copper</small>
            </div>
          </div>
          <Field label={`Gold bars (${fmt(bank.balance)} copper)`} hint={vaultCap !== null ? `the vault has ${vaultCap} slots - up to ${maxBars} bars (${fmt(maxBars * GOLD_BAR_VALUE)} copper)` : undefined}>
            <NumberField value={bank.goldBars} min={0} max={maxBars} onChange={(v) => mutate((mm) => setGoldBars(mm, db, v))} />
          </Field>
          <div className="quick">
            {[50, 100, 200, maxBars].filter((v, i, a) => v <= maxBars && a.indexOf(v) === i).map((v) => (
              <button key={v} className="chip" onClick={() => mutate((mm) => setGoldBars(mm, db, v))}>
                {v} bars
              </button>
            ))}
          </div>
          {bank.history.length > 0 && (
            <div className="hint">
              Last interest update: {bank.history[bank.history.length - 1].percent / 10000}% → {fmt(bank.history[bank.history.length - 1].current)} copper
              {bank.propensity ? ` · propensity ${bank.propensity}` : ''}
            </div>
          )}
          {!bank.bankNode && <div className="hint">No bank account in this save yet — the vault bag may still be missing until you visit a bank.</div>}
        </div>

        <div className="currency-card">
          <span className="glow" style={{ background: '#4b9aa3' }} />
          <div className="head">
            <div>
              <h4>{ch ? db.characterName(ch.characterKey) : 'Character'}</h4>
              <small>CharacterStatusSaveData</small>
            </div>
          </div>
          {ch ? (
            <div className="grid cols-2" style={{ gap: 8 }}>
              <Field label="Current HP">
                <NumberField value={ch.hp} min={1} max={999_999} onChange={(v) => mutate((mm) => mm.set(ch.node, '_currentHp', v))} />
              </Field>
              <Field label="Current MP">
                <NumberField value={ch.mp} min={0} max={999_999} onChange={(v) => mutate((mm) => mm.set(ch.node, '_currentMp', v))} />
              </Field>
              <Field label="Level">
                <NumberField value={ch.level} min={1} max={9999} onChange={(v) => mutate((mm) => mm.set(ch.node, '_level', v))} />
              </Field>
              <Field label="Unspent skill points">
                <NumberField value={ch.skillPoints} min={0} max={65535} onChange={(v) => mutate((mm) => mm.set(ch.node, '_remainSkillPoint', v))} />
              </Field>
              <Field label="Experience">
                <NumberField value={Number(ch.exp)} min={0} max={9e15} onChange={(v) => mutate((mm) => mm.set(ch.node, '_experience', BigInt(v)))} />
              </Field>
              <Field label="Remaining experience">
                <NumberField value={Number(ch.remainExp)} min={0} max={9e15} onChange={(v) => mutate((mm) => mm.set(ch.node, '_remainExperience', BigInt(v)))} />
              </Field>
            </div>
          ) : (
            <div className="hint">This save has no character status block.</div>
          )}
        </div>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h3>
            Camp resources
            <span className="right hint">bag 1 · Money &amp; resources</span>
          </h3>
          {money.camp.map((l) => (
            <div className="money-row" key={l.key}>
              <ItemIcon db={db} itemKey={l.key} size={30} radius={5} />
              <span className="nm">{db.itemName(l.key)}</span>
              <NumberField value={l.count} min={0} max={9_000_000_000} step={100} onChange={(v) => mutate((mm) => setMoney(mm, db, BAG_MONEY, l.key, v))} />
            </div>
          ))}
          {money.other.length > 0 && <div className="section-title">Contributions &amp; tokens <span className="count">{money.other.length}</span></div>}
          {money.other.map((l) => (
            <div className="money-row" key={l.key}>
              <ItemIcon db={db} itemKey={l.key} size={30} radius={5} />
              <span className="nm" title={db.item(l.key)?.i}>
                {db.itemName(l.key)}
              </span>
              <NumberField value={l.count} min={0} max={9_000_000_000} onChange={(v) => mutate((mm) => l.node && setStack(mm, l.node, v))} />
            </div>
          ))}
        </div>

        <div className="card">
          <h3>
            Skill points &amp; progress tracks
            <span className="right hint">SubLevelSaveData</span>
          </h3>
          {sp.length > 0 && (
            <table className="tbl" style={{ marginBottom: 12 }}>
              <thead>
                <tr>
                  <th>Skill points</th>
                  <th>Unspent</th>
                  <th>Spent so far</th>
                </tr>
              </thead>
              <tbody>
                {sp.map((p) => (
                  <tr key={p.owner}>
                    <td className="name">{SKILL_OWNER[p.owner] ?? `Owner ${p.owner}`}</td>
                    <td>
                      <NumberField value={p.current} min={0} max={65535} onChange={(v) => mutate((mm) => mm.set(p.node, '_currentSkillPoint', v))} />
                    </td>
                    <td>
                      <NumberField value={p.elapsed} min={0} max={65535} onChange={(v) => mutate((mm) => mm.set(p.node, '_elapsedSkillPoint', v))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <table className="tbl">
            <thead>
              <tr>
                <th>Track</th>
                <th>Level</th>
                <th>Max reached</th>
                <th>XP</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.key}>
                  <td className="mono">#{s.key}</td>
                  <td>
                    <NumberField value={s.level} min={0} max={9999} onChange={(v) => mutate((mm) => { mm.set(s.node, '_level', v); if (v > s.maxLevel) mm.set(s.node, '_maxAchievedLevel', v); })} />
                  </td>
                  <td>
                    <NumberField value={s.maxLevel} min={0} max={9999} onChange={(v) => mutate((mm) => mm.set(s.node, '_maxAchievedLevel', v))} />
                  </td>
                  <td>
                    <NumberField value={Number(s.exp)} min={0} max={9e15} onChange={(v) => mutate((mm) => mm.set(s.node, '_experience', BigInt(v)))} />
                  </td>
                </tr>
              ))}
              {!subs.length && (
                <tr>
                  <td colSpan={4} className="hint">No progress tracks in this save.</td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="hint" style={{ marginTop: 8 }}>
            Progress tracks are the game's internal sub-levels (mastery / region style counters); their names are not stored in the save.
          </div>
        </div>
      </div>
    </>
  );
}

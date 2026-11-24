/** Guided course (lessons + quizzes + progress) and the Arduino Uno board explorer. */
import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import * as A from '../actions';
import { Icon } from '../components/Icons';
import { EXAMPLES } from '../../shared/examples';
import { LESSONS, Lesson, lessonDone } from '../../shared/lessons';

type L = 'ar' | 'en';
const tr = (lang: L, ar: string, en: string) => (lang === 'ar' ? ar : en);

export function LessonsPage() {
  const lang = useStore((s) => s.lang) as L;
  const progress = useStore((s) => s.lessonProgress);
  const [tab, setTab] = useState<'course' | 'board' | 'all'>('course');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { A.loadLessonProgress(); }, []);
  const basics = LESSONS.filter((l) => l.track === 'basics');
  const more = LESSONS.filter((l) => l.track === 'more');
  const done = basics.filter((l) => lessonDone(progress[l.id])).length;
  const lesson = LESSONS.find((l) => l.id === open);
  if (lesson) return <LessonView lesson={lesson} lang={lang} onBack={() => setOpen(null)} onOpen={setOpen} />;
  const nextUp = basics.find((l) => !lessonDone(progress[l.id]));
  return (
    <div className="page">
      <div className="page-h"><h2><Icon name="cap" /> {tr(lang, 'تعلّم Arduino', 'Learn Arduino')}</h2>
        <div className="seg">
          <button className={tab === 'course' ? 'on' : ''} onClick={() => setTab('course')}>{tr(lang, 'الدورة', 'Course')}</button>
          <button className={tab === 'board' ? 'on' : ''} onClick={() => setTab('board')}>{tr(lang, 'مستكشف اللوحة', 'Board explorer')}</button>
          <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>{tr(lang, 'كل الأمثلة', 'All examples')}</button>
        </div>
      </div>
      {tab === 'course' && <>
        <div className="course-hero card">
          <div className="ch-text">
            <b>{tr(lang, 'من الصفر إلى أول مشروع', 'From zero to your first project')}</b>
            <p className="muted">{tr(lang, 'كل درس يفتح دائرة حقيقية تعمل في المحاكي. يكتمل الدرس عندما تشغّل مثاله وتجيب عن أسئلته.', 'Each lesson opens a real circuit that runs in the simulator. A lesson is complete once you run its example and pass its quiz.')}</p>
            <div className="prog"><div className="prog-bar"><i style={{ width: `${(done / basics.length) * 100}%` }} /></div><span className="prog-n" data-testid="course-progress">{tr(lang, 'الأساسيات', 'Basics')} {done}/{basics.length}</span></div>
          </div>
          {nextUp && <button className="btn primary" onClick={() => setOpen(nextUp.id)}><Icon name="play" size={14} /> {done ? tr(lang, 'تابع', 'Continue') : tr(lang, 'ابدأ', 'Start')}: {nextUp.title[lang]}</button>}
          {!nextUp && <div className="ok"><Icon name="trophy" /> {tr(lang, 'أكملت الأساسيات كلها!', 'All basics complete!')}</div>}
        </div>
        <LessonGrid list={basics} lang={lang} progress={progress} onOpen={setOpen} start={1} />
        <section className="cat"><h3>{tr(lang, 'تدريبات إضافية', 'Further practice')}</h3>
          <LessonGrid list={more} lang={lang} progress={progress} onOpen={setOpen} start={basics.length + 1} /></section>
        {Object.keys(progress).length > 0 && <p><button className="btn sm" onClick={A.resetLessonProgress}><Icon name="refresh" size={14} /> {tr(lang, 'إعادة ضبط التقدّم', 'Reset progress')}</button></p>}
      </>}
      {tab === 'board' && <UnoExplorer lang={lang} />}
      {tab === 'all' && <AllExamples lang={lang} />}
    </div>
  );
}

function LessonGrid({ list, lang, progress, onOpen, start }: { list: Lesson[]; lang: L; progress: Record<string, any>; onOpen: (id: string) => void; start: number }) {
  return (
    <div className="lesson-grid">
      {list.map((l, i) => {
        const p = progress[l.id]; const ok = lessonDone(p);
        return (
          <button key={l.id} className={`lesson course${ok ? ' done' : ''}`} onClick={() => onOpen(l.id)} data-testid={`lesson-${l.id}`}>
            <div className="lesson-n">{ok ? <Icon name="check" size={16} /> : start + i}</div>
            <div className="lesson-b"><b>{l.title[lang]}</b><p>{l.summary[lang]}</p>
              <div className="lesson-tags"><span className={p?.ran ? 'on' : ''}><Icon name="play" size={11} /> {tr(lang, 'تشغيل', 'Run')}</span><span className={p?.quiz ? 'on' : ''}><Icon name="check" size={11} /> {tr(lang, 'اختبار', 'Quiz')}</span></div></div>
          </button>
        );
      })}
    </div>
  );
}

function LessonView({ lesson, lang, onBack, onOpen }: { lesson: Lesson; lang: L; onBack: () => void; onOpen: (id: string) => void }) {
  const p = useStore((s) => s.lessonProgress[lesson.id]);
  const [answers, setAnswers] = useState<(number | null)[]>(() => lesson.quiz.map(() => null));
  const [checked, setChecked] = useState(false);
  useEffect(() => { setAnswers(lesson.quiz.map(() => null)); setChecked(false); }, [lesson.id]);
  const idx = LESSONS.indexOf(lesson);
  const next = LESSONS[idx + 1]; const prev = LESSONS[idx - 1];
  const allRight = answers.every((a, i) => a === lesson.quiz[i].answer);
  const check = () => { setChecked(true); if (allRight) { A.setLessonProgress(lesson.id, { quiz: true }); A.toast(tr(lang, 'إجابات صحيحة!', 'All correct!'), 'ok'); } };
  const ex = EXAMPLES.find((e) => e.id === lesson.example);
  return (
    <div className="page lesson-view">
      <div className="page-h"><button className="btn sm" onClick={onBack}><Icon name="menu" size={14} /> {tr(lang, 'كل الدروس', 'All lessons')}</button>
        <h2>{idx + 1}. {lesson.title[lang]}</h2>
        {lessonDone(p) && <span className="ok"><Icon name="trophy" /> {tr(lang, 'مكتمل', 'Complete')}</span>}
      </div>
      <p className="lead">{lesson.summary[lang]}</p>
      <div className="lv-grid">
        <div className="lv-main">
          <section className="card"><h3><Icon name="trophy" size={16} /> {tr(lang, 'ماذا ستتعلم', 'What you will learn')}</h3><ul>{lesson.goals.map((g, i) => <li key={i}>{g[lang]}</li>)}</ul></section>
          {lesson.id === 'meet-board' && <section className="card"><UnoExplorer lang={lang} compact /></section>}
          <section className="card"><h3><Icon name="wrench" size={16} /> {tr(lang, 'خطوات البناء', 'Build steps')}</h3><ol className="steps">{lesson.steps.map((s, i) => <li key={i}>{s[lang]}</li>)}</ol></section>
          <section className="card"><h3><Icon name="bulb" size={16} /> {tr(lang, 'كيف يعمل', 'How it works')}</h3>{lesson.explain.map((e, i) => <p key={i}>{e[lang]}</p>)}</section>
          <section className="card"><h3><Icon name="code" size={16} /> {tr(lang, 'أهم أسطر الكود', 'Key lines of code')}</h3>
            <div className="code-notes">{lesson.code.map((c, i) => <div key={i}><code dir="ltr">{c.line}</code><span>{c.note[lang]}</span></div>)}</div></section>
          <section className="card challenge"><h3><Icon name="bolt" size={16} /> {tr(lang, 'جرّب بنفسك', 'Try it yourself')}</h3><p>{lesson.tryIt[lang]}</p></section>
          <section className="card quiz" data-testid="quiz"><h3><Icon name="help" size={16} /> {tr(lang, 'اختبر فهمك', 'Check your understanding')}</h3>
            {lesson.quiz.map((qq, qi) => (
              <div key={qi} className="qq"><b>{qi + 1}. {qq.q[lang]}</b>
                <div className="opts">{qq.options.map((o, oi) => {
                  const sel = answers[qi] === oi; const cls = checked && sel ? (oi === qq.answer ? ' right' : ' wrong') : sel ? ' sel' : '';
                  return <button key={oi} className={'opt' + cls} onClick={() => { setChecked(false); setAnswers((a) => a.map((x, k) => (k === qi ? oi : x))); }}>{o[lang]}</button>;
                })}</div>
                {checked && answers[qi] !== null && <div className={answers[qi] === qq.answer ? 'ok small' : 'bad small'}>{answers[qi] === qq.answer ? '✓ ' : '✗ '}{qq.why[lang]}</div>}
              </div>
            ))}
            <button className="btn primary" disabled={answers.some((a) => a === null)} onClick={check}><Icon name="check" size={14} /> {tr(lang, 'تحقّق', 'Check')}</button>
            {checked && !allRight && <span className="muted small"> {tr(lang, 'راجع الإجابات المعلَّمة وحاول مجدداً.', 'Review the marked answers and try again.')}</span>}
          </section>
        </div>
        <aside className="lv-side">
          <div className="card sticky">
            <h3>{tr(lang, 'في المحاكي', 'In the simulator')}</h3>
            <p className="muted small">{ex?.title[lang]}</p>
            <h4>{tr(lang, 'المكونات', 'Parts')}</h4><ul className="parts-list">{lesson.parts.map((x, i) => <li key={i}>{x[lang]}</li>)}</ul>
            <div className="lv-actions">
              <button className="btn" onClick={() => A.openLesson(lesson.id, lesson.example)}><Icon name="folder" size={14} /> {tr(lang, 'افتح في المحاكي', 'Open in simulator')}</button>
              <button className="btn run" data-testid="lesson-run" onClick={() => A.openLesson(lesson.id, lesson.example, true)}><Icon name="play" size={14} /> {tr(lang, 'افتح وشغّل', 'Open and run')}</button>
            </div>
            <div className="checks">
              <div className={p?.ran ? 'ok' : 'muted'}><Icon name={p?.ran ? 'check' : 'clock'} size={14} /> {tr(lang, 'شغّلت المثال', 'Ran the example')}</div>
              <div className={p?.quiz ? 'ok' : 'muted'}><Icon name={p?.quiz ? 'check' : 'clock'} size={14} /> {tr(lang, 'نجحت في الاختبار', 'Passed the quiz')}</div>
            </div>
            <div className="lv-nav">
              {prev && <button className="btn sm" onClick={() => onOpen(prev.id)}>{lang === 'ar' ? '→' : '←'} {prev.title[lang]}</button>}
              {next && <button className="btn sm" onClick={() => onOpen(next.id)}>{next.title[lang]} {lang === 'ar' ? '←' : '→'}</button>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AllExamples({ lang }: { lang: L }) {
  const names = { 1: { ar: 'مبتدئ', en: 'Beginner' }, 2: { ar: 'متوسط', en: 'Intermediate' }, 3: { ar: 'متقدم', en: 'Advanced' } } as const;
  return <>{([1, 2, 3] as const).map((lv) => (
    <section key={lv} className="cat"><h3>{names[lv][lang]}</h3>
      <div className="lesson-grid">{EXAMPLES.filter((e) => e.level === lv).map((ex, i) => (
        <div key={ex.id} className="lesson"><div className="lesson-n">{i + 1}</div>
          <div className="lesson-b"><b>{ex.title[lang]}</b><p>{ex.description[lang]}</p></div>
          <div className="lesson-a">
            <button className="btn sm" onClick={() => { A.loadExample(ex.id); A.go('home'); }}><Icon name="folder" size={14} /> {tr(lang, 'فتح', 'Open')}</button>
            <button className="btn sm run" onClick={() => { A.loadExample(ex.id); A.go('home'); A.runSimulation(); }}><Icon name="play" size={14} /> {tr(lang, 'تشغيل', 'Run')}</button>
          </div></div>))}</div>
    </section>))}</>;
}

/* ---------------- Arduino Uno board explorer ---------------- */
type Fn = 'digital' | 'pwm' | 'analog' | 'i2c' | 'spi' | 'uart' | 'int' | 'power' | 'led';
interface PinInfo { id: string; port?: string; fns: Fn[]; note: { ar: string; en: string } }
const FN_LABEL: Record<Fn, { ar: string; en: string; c: string }> = {
  digital: { ar: 'رقمي', en: 'Digital', c: '#2f9bff' }, pwm: { ar: 'PWM ~', en: 'PWM ~', c: '#a66bff' }, analog: { ar: 'تناظري ADC', en: 'Analog ADC', c: '#2fd36b' },
  i2c: { ar: 'I2C', en: 'I2C', c: '#17c3d6' }, spi: { ar: 'SPI', en: 'SPI', c: '#ff8a3d' }, uart: { ar: 'تسلسلي UART', en: 'Serial UART', c: '#ffc23a' },
  int: { ar: 'مقاطعة خارجية', en: 'External interrupt', c: '#ff5a8a' }, power: { ar: 'تغذية', en: 'Power', c: '#ff5a5a' }, led: { ar: 'LED مدمج', en: 'Built-in LED', c: '#ffb000' },
};
const n = (ar: string, en: string) => ({ ar, en });
const DIGITAL: PinInfo[] = [
  { id: 'D0', port: 'PD0', fns: ['digital', 'uart'], note: n('RX: استقبال التسلسلي. تجنّب استخدامه مع Serial.', 'RX: serial receive. Avoid when using Serial.') },
  { id: 'D1', port: 'PD1', fns: ['digital', 'uart'], note: n('TX: إرسال التسلسلي.', 'TX: serial transmit.') },
  { id: 'D2', port: 'PD2', fns: ['digital', 'int'], note: n('INT0: attachInterrupt(0, ...).', 'INT0: attachInterrupt(0, ...).') },
  { id: 'D3', port: 'PD3', fns: ['digital', 'pwm', 'int'], note: n('INT1 وPWM من المؤقت 2.', 'INT1 and PWM from Timer2.') },
  { id: 'D4', port: 'PD4', fns: ['digital'], note: n('منفذ رقمي عام.', 'General digital pin.') },
  { id: 'D5', port: 'PD5', fns: ['digital', 'pwm'], note: n('PWM من المؤقت 0 (~980Hz).', 'PWM from Timer0 (~980 Hz).') },
  { id: 'D6', port: 'PD6', fns: ['digital', 'pwm'], note: n('PWM من المؤقت 0 (~980Hz).', 'PWM from Timer0 (~980 Hz).') },
  { id: 'D7', port: 'PD7', fns: ['digital'], note: n('منفذ رقمي عام.', 'General digital pin.') },
  { id: 'D8', port: 'PB0', fns: ['digital'], note: n('منفذ رقمي عام.', 'General digital pin.') },
  { id: 'D9', port: 'PB1', fns: ['digital', 'pwm'], note: n('PWM من المؤقت 1 (مكتبة Servo تستخدمه).', 'PWM from Timer1 (used by Servo).') },
  { id: 'D10', port: 'PB2', fns: ['digital', 'pwm', 'spi'], note: n('SS لناقل SPI، وPWM.', 'SPI SS, and PWM.') },
  { id: 'D11', port: 'PB3', fns: ['digital', 'pwm', 'spi'], note: n('MOSI لناقل SPI، وPWM.', 'SPI MOSI, and PWM.') },
  { id: 'D12', port: 'PB4', fns: ['digital', 'spi'], note: n('MISO لناقل SPI.', 'SPI MISO.') },
  { id: 'D13', port: 'PB5', fns: ['digital', 'spi', 'led'], note: n('SCK لناقل SPI، ومتصل بـ LED المدمج L.', 'SPI SCK, wired to the built-in L LED.') },
];
const ANALOG: PinInfo[] = [
  { id: 'A0', port: 'PC0', fns: ['analog', 'digital'], note: n('ADC قناة 0، ويعمل كرقمي D14.', 'ADC channel 0, also digital D14.') },
  { id: 'A1', port: 'PC1', fns: ['analog', 'digital'], note: n('ADC قناة 1 (D15).', 'ADC channel 1 (D15).') },
  { id: 'A2', port: 'PC2', fns: ['analog', 'digital'], note: n('ADC قناة 2 (D16).', 'ADC channel 2 (D16).') },
  { id: 'A3', port: 'PC3', fns: ['analog', 'digital'], note: n('ADC قناة 3 (D17).', 'ADC channel 3 (D17).') },
  { id: 'A4', port: 'PC4', fns: ['analog', 'digital', 'i2c'], note: n('SDA لناقل I2C (مكتبة Wire).', 'I2C SDA (Wire library).') },
  { id: 'A5', port: 'PC5', fns: ['analog', 'digital', 'i2c'], note: n('SCL لناقل I2C (مكتبة Wire).', 'I2C SCL (Wire library).') },
];
const POWER: PinInfo[] = [
  { id: '5V', fns: ['power'], note: n('خرج 5V منظَّم من USB أو المنظم.', 'Regulated 5 V from USB or the regulator.') },
  { id: '3.3V', fns: ['power'], note: n('خرج 3.3V بحد ~50mA.', '3.3 V output, ~50 mA max.') },
  { id: 'GND', fns: ['power'], note: n('الأرضي المشترك لكل الدائرة.', 'Common ground for the circuit.') },
  { id: 'VIN', fns: ['power'], note: n('دخل 7–12V عند التغذية الخارجية.', '7–12 V input when externally powered.') },
  { id: 'AREF', fns: ['analog'], note: n('جهد مرجعي خارجي للمحوّل ADC.', 'External ADC reference voltage.') },
  { id: 'RESET', fns: ['power'], note: n('وصله بـ GND يعيد تشغيل المعالج.', 'Pull to GND to reset the MCU.') },
];
const SPECS: [{ ar: string; en: string }, string][] = [
  [n('المعالج', 'Microcontroller'), 'ATmega328P (AVR 8-bit)'], [n('التردد', 'Clock'), '16 MHz'], [n('ذاكرة البرنامج', 'Flash'), '32 KB (0.5 KB bootloader)'],
  [n('ذاكرة SRAM', 'SRAM'), '2 KB'], [n('ذاكرة EEPROM', 'EEPROM'), '1 KB'], [n('جهد التشغيل', 'Operating voltage'), '5 V'], [n('جهد الدخل VIN', 'Input voltage VIN'), '7–12 V'],
  [n('منافذ رقمية', 'Digital I/O'), '14 (6 PWM)'], [n('مداخل تناظرية', 'Analog inputs'), '6 (10-bit)'], [n('تيار المنفذ', 'Current per pin'), '20 mA (40 mA max)'],
  [n('المؤقتات', 'Timers'), 'Timer0/2 8-bit · Timer1 16-bit'], [n('النواقل', 'Buses'), 'UART · I2C (TWI) · SPI'],
];

export function UnoExplorer({ lang, compact = false }: { lang: L; compact?: boolean }) {
  const [tab, setTab] = useState<'pinout' | 'specs' | 'overview'>(compact ? 'pinout' : 'overview');
  const [filter, setFilter] = useState<Fn | null>(null);
  const [pin, setPin] = useState<PinInfo | null>(DIGITAL[13]);
  const has = (p: PinInfo) => !filter || p.fns.includes(filter);
  const Row = ({ pins }: { pins: PinInfo[] }) => (
    <div className="ux-row">{pins.map((p) => (
      <button key={p.id} className={`ux-pin${pin?.id === p.id ? ' sel' : ''}${has(p) ? '' : ' dim'}`} onMouseEnter={() => setPin(p)} onFocus={() => setPin(p)} onClick={() => setPin(p)} data-testid={`ux-${p.id}`}>
        <span className="ux-hole" style={{ background: FN_LABEL[(filter && p.fns.includes(filter) ? filter : p.fns.find((f) => f !== 'digital') ?? p.fns[0])].c }} />
        <span className="ux-id">{p.fns.includes('pwm') ? '~' : ''}{p.id}</span>
      </button>))}</div>
  );
  const stats = useMemo(() => ({ pwm: DIGITAL.filter((p) => p.fns.includes('pwm')).length }), []);
  return (
    <div className="uno-x">
      {!compact && <div className="seg sm">
        {(['overview', 'pinout', 'specs'] as const).map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{{ overview: tr(lang, 'نظرة عامة', 'Overview'), pinout: tr(lang, 'خريطة المنافذ', 'Pinout'), specs: tr(lang, 'المواصفات', 'Specifications') }[k]}</button>)}
      </div>}
      {tab === 'overview' && <div className="ux-over">
        <p>{tr(lang, 'Arduino Uno لوحة تطوير مبنية على المعالج ATmega328P. تبرمجها عبر USB، وتتصل بالحساسات والمخارج عبر 20 منفذاً. المحاكي ينفّذ نفس ملف HEX الذي يُرفع إلى اللوحة الحقيقية.', 'The Arduino Uno is a development board built on the ATmega328P. You program it over USB and connect sensors and outputs to its 20 I/O pins. The simulator runs the same HEX file that is uploaded to a real board.')}</p>
        <div className="ux-cards">
          <div><b>14</b><span>{tr(lang, 'منفذاً رقمياً', 'digital pins')}</span></div><div><b>{stats.pwm}</b><span>{tr(lang, 'منافذ PWM', 'PWM pins')}</span></div>
          <div><b>6</b><span>{tr(lang, 'مداخل تناظرية', 'analog inputs')}</span></div><div><b>16MHz</b><span>{tr(lang, 'تردد المعالج', 'clock')}</span></div>
          <div><b>32KB</b><span>{tr(lang, 'ذاكرة برنامج', 'flash')}</span></div><div><b>2KB</b><span>{tr(lang, 'ذاكرة RAM', 'RAM')}</span></div>
        </div>
        <button className="btn sm" onClick={() => setTab('pinout')}><Icon name="chip" size={14} /> {tr(lang, 'استكشف المنافذ', 'Explore the pins')}</button>
      </div>}
      {tab === 'pinout' && <div className="ux-pinout">
        <div className="ux-legend">{(Object.keys(FN_LABEL) as Fn[]).filter((f) => f !== 'led').map((f) => (
          <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(filter === f ? null : f)}><i style={{ background: FN_LABEL[f].c }} />{FN_LABEL[f][lang]}</button>))}</div>
        <div className="ux-board" dir="ltr">
          <div className="ux-label">DIGITAL (PWM ~)</div>
          <Row pins={[...DIGITAL].reverse()} />
          <div className="ux-chip"><span>ATmega328P</span><small>16 MHz</small></div>
          <div className="ux-bottom"><Row pins={POWER} /><Row pins={ANALOG} /></div>
          <div className="ux-label">POWER · ANALOG IN</div>
        </div>
        {pin && <div className="ux-info" data-testid="ux-info"><b dir="ltr">{pin.id}{pin.port ? ` · ${pin.port}` : ''}</b>
          <div className="ux-fns">{pin.fns.map((f) => <span key={f} style={{ borderColor: FN_LABEL[f].c, color: FN_LABEL[f].c }}>{FN_LABEL[f][lang]}</span>)}</div>
          <p>{pin.note[lang]}</p></div>}
      </div>}
      {tab === 'specs' && <table className="ux-specs"><tbody>{SPECS.map(([k, v], i) => <tr key={i}><td>{k[lang]}</td><td dir="ltr">{v}</td></tr>)}</tbody></table>}
    </div>
  );
}

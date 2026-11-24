/**
 * Guided beginner course. Every lesson opens a real, runnable example project
 * (see examples.ts) and is completed when the learner has run it in the
 * simulator and answered its short quiz correctly.
 */
export type T = { ar: string; en: string };
export interface QuizQ { q: T; options: T[]; answer: number; why: T }
export interface Lesson {
  id: string;
  example: string;           // example id opened in the simulator
  track: 'basics' | 'more';
  title: T;
  summary: T;
  goals: T[];
  parts: T[];
  steps: T[];                // build / wiring walkthrough
  explain: T[];              // concept paragraphs
  code: { line: string; note: T }[]; // key lines of the sketch and what they do
  tryIt: T;                  // a hands-on challenge in the simulator
  quiz: QuizQ[];
}

const t = (ar: string, en: string): T => ({ ar, en });
const q = (qq: T, options: T[], answer: number, why: T): QuizQ => ({ q: qq, options, answer, why });

export const LESSONS: Lesson[] = [
  {
    id: 'meet-board', example: 'blink', track: 'basics',
    title: t('تعرّف على اللوحة', 'Meet the board'),
    summary: t('لوحة Arduino Uno ومعالجها ATmega328P، ومنافذها وكيف يصل البرنامج إليها.', 'The Arduino Uno, its ATmega328P microcontroller, its pins and how a sketch reaches them.'),
    goals: [t('تمييز المنافذ الرقمية والتناظرية ومنافذ التغذية', 'Tell digital, analog and power pins apart'), t('فهم دورة البرنامج: setup مرة ثم loop بلا توقف', 'Understand the sketch cycle: setup once, then loop forever'), t('معرفة حدود التيار والجهد الآمنة', 'Know the safe voltage and current limits')],
    parts: [t('لوحة Arduino Uno', 'Arduino Uno board')],
    steps: [t('افتح «مستكشف اللوحة» في الأسفل ومرّر الفأرة على المنافذ لترى وظيفة كل منفذ.', 'Open the board explorer below and hover the pins to see what each one does.'), t('اضغط «افتح في المحاكي» ثم «تشغيل المحاكاة».', 'Press "Open in simulator" then "Run simulation".'), t('راقب LED المدمج على المنفذ 13 وهو يومض، وراقب شريط الحالة: الزمن المحاكى وعدد دورات المعالج.', 'Watch the built-in LED on pin 13 blink, and the status bar: simulated time and CPU cycles.')],
    explain: [t('المعالج ATmega328P يعمل بتردد 16MHz، أي 16 مليون دورة في الثانية. لديه 32KB ذاكرة برنامج و2KB ذاكرة متغيرات. المحاكي ينفّذ ملف HEX الحقيقي تعليمةً بتعليمة.', 'The ATmega328P runs at 16 MHz, 16 million cycles per second, with 32 KB of program memory and 2 KB of RAM. The simulator executes the real HEX file instruction by instruction.'), t('المنافذ D0 إلى D13 رقمية (HIGH = 5V أو LOW = 0V)، والمنافذ A0 إلى A5 تقرأ جهداً من 0 إلى 5V وتحوّله إلى رقم من 0 إلى 1023. المنافذ 3 و5 و6 و9 و10 و11 تدعم PWM (العلامة ~).', 'Pins D0 to D13 are digital (HIGH = 5 V, LOW = 0 V); A0 to A5 read 0–5 V as a number from 0 to 1023. Pins 3, 5, 6, 9, 10 and 11 support PWM (the ~ mark).'), t('كل منفذ يتحمل 20mA بأمان و40mA كحد أقصى. المحاكي ينبّهك إذا تجاوزت ذلك.', 'Each pin handles 20 mA comfortably and 40 mA at most. The simulator warns you when you exceed it.')],
    code: [{ line: 'void setup() { ... }', note: t('تُنفَّذ مرة واحدة عند التشغيل أو بعد RESET.', 'Runs once at power-up or after RESET.') }, { line: 'void loop() { ... }', note: t('تتكرر بلا توقف ما دامت اللوحة تعمل.', 'Repeats forever while the board is powered.') }],
    tryIt: t('اضغط زر RESET على اللوحة أثناء التشغيل وراقب كيف يبدأ البرنامج من جديد.', 'Press the RESET button on the board while running and watch the sketch start over.'),
    quiz: [
      q(t('كم مرة تُنفَّذ الدالة setup()؟', 'How many times does setup() run?'), [t('مرة واحدة', 'Once'), t('كل ثانية', 'Every second'), t('بلا توقف', 'Forever')], 0, t('setup() للتهيئة فقط، أما loop() فتتكرر.', 'setup() is for initialisation; loop() is the part that repeats.')),
      q(t('أي منفذ يقرأ جهداً تناظرياً؟', 'Which pin reads an analog voltage?'), [t('D13', 'D13'), t('A0', 'A0'), t('GND', 'GND')], 1, t('المنافذ A0 إلى A5 متصلة بمحوّل ADC بدقة 10 بت.', 'A0–A5 are connected to the 10-bit ADC.')),
    ],
  },
  {
    id: 'blink', example: 'blink', track: 'basics',
    title: t('وميض LED', 'Blink an LED'),
    summary: t('أول دائرة: LED ومقاومة على لوحة التجارب يتحكم بها المنفذ 13.', 'First circuit: an LED and a resistor on the breadboard, driven by pin 13.'),
    goals: [t('توصيل LED بالاتجاه الصحيح مع مقاومة حماية', 'Wire an LED the right way round with a series resistor'), t('استخدام pinMode وdigitalWrite وdelay', 'Use pinMode, digitalWrite and delay'), t('حساب تيار LED', 'Work out the LED current')],
    parts: [t('LED أحمر', 'Red LED'), t('مقاومة 220Ω', '220 Ω resistor'), t('أسلاك توصيل', 'Jumper wires')],
    steps: [t('الطرف الطويل (الموجب +A) يتصل بالمقاومة، والطرف القصير (K−) بخط GND.', 'The long leg (A+) goes to the resistor, the short leg (K−) to the GND rail.'), t('الطرف الآخر للمقاومة يتصل بالمنفذ 13.', 'The other end of the resistor goes to pin 13.'), t('شغّل المحاكاة ومرّر الفأرة فوق طرف LED لترى الجهد.', 'Run the simulation and hover the LED leg to see its voltage.')],
    explain: [t('المقاومة تحدّ التيار: I = (5V − 2V) ÷ 220Ω ≈ 13.6mA، والـ 2V هو هبوط الجهد على LED الأحمر. بدون مقاومة يمر تيار كبير يتلف LED والمنفذ.', 'The resistor limits the current: I = (5 V − 2 V) ÷ 220 Ω ≈ 13.6 mA, where 2 V is the red LED\'s forward drop. Without it the current would damage the LED and the pin.'), t('delay(1000) يوقف البرنامج 1000 ملي ثانية. المخطط الزمني يُظهر أن الفترة ثانية واحدة بالضبط.', 'delay(1000) pauses for 1000 ms. The timeline shows the period is exactly one second.')],
    code: [{ line: 'pinMode(13, OUTPUT);', note: t('يجعل المنفذ 13 مخرجاً.', 'Makes pin 13 an output.') }, { line: 'digitalWrite(13, HIGH);', note: t('يضع 5V على المنفذ فيضيء LED.', 'Puts 5 V on the pin, lighting the LED.') }, { line: 'delay(1000);', note: t('ينتظر ثانية.', 'Waits one second.') }],
    tryIt: t('غيّر delay(1000) إلى delay(200) وشغّل مجدداً، ثم افتح «مخطط زمني» وقِس التردد الجديد.', 'Change delay(1000) to delay(200), run again, then open the timeline and measure the new frequency.'),
    quiz: [
      q(t('ما وظيفة المقاومة مع LED؟', 'What is the resistor for?'), [t('زيادة السطوع', 'More brightness'), t('تحديد التيار', 'Limiting the current'), t('تخزين الطاقة', 'Storing energy')], 1, t('LED لا يحدّ تياره بنفسه، فالمقاومة تحميه وتحمي المنفذ.', 'An LED does not limit its own current, so the resistor protects it and the pin.')),
      q(t('أي طرف من LED يتصل بـ GND؟', 'Which LED leg goes to GND?'), [t('الطويل (A+)', 'The long one (A+)'), t('القصير (K−)', 'The short one (K−)')], 1, t('الكاثود (K) هو الطرف السالب القصير.', 'The cathode (K) is the short negative leg.')),
    ],
  },
  {
    id: 'button', example: 'button', track: 'basics',
    title: t('زر الضغط', 'Push a button'),
    summary: t('المداخل تجعل اللوحة تستشعر العالم: زر يضيء LED.', 'Inputs let the board sense the world: a button lights an LED.'),
    goals: [t('قراءة مدخل رقمي بـ digitalRead', 'Read a digital input with digitalRead'), t('فهم مقاومة السحب الداخلية INPUT_PULLUP', 'Understand the internal INPUT_PULLUP resistor')],
    parts: [t('زر ضغط', 'Push button'), t('LED أخضر ومقاومة 220Ω', 'Green LED and 220 Ω resistor')],
    steps: [t('ضع الزر فوق الفراغ الأوسط للوحة التجارب.', 'Place the button across the middle gap of the breadboard.'), t('طرف يتصل بالمنفذ 2، والطرف المقابل بـ GND.', 'One side to pin 2, the opposite side to GND.'), t('شغّل المحاكاة ثم اضغط الزر بالفأرة مطوّلاً.', 'Run the simulation, then hold the button down with the mouse.')],
    explain: [t('مع INPUT_PULLUP تربط مقاومة داخلية (~35kΩ) المنفذ بـ 5V، فيقرأ HIGH. عند الضغط يتصل المنفذ بـ GND فيقرأ LOW.', 'With INPUT_PULLUP an internal ~35 kΩ resistor ties the pin to 5 V, so it reads HIGH. Pressing connects it to GND, so it reads LOW.'), t('لذلك المنطق معكوس: مضغوط = LOW.', 'So the logic is inverted: pressed = LOW.')],
    code: [{ line: 'pinMode(BUTTON, INPUT_PULLUP);', note: t('يفعّل مقاومة السحب الداخلية.', 'Enables the internal pull-up.') }, { line: 'digitalRead(BUTTON) == LOW', note: t('يعني أن الزر مضغوط.', 'Means the button is pressed.') }],
    tryIt: t('اجعل LED يضيء عندما يكون الزر غير مضغوط فقط.', 'Make the LED light only while the button is NOT pressed.'),
    quiz: [
      q(t('ماذا يقرأ المنفذ مع INPUT_PULLUP والزر غير مضغوط؟', 'What does an INPUT_PULLUP pin read when the button is released?'), [t('HIGH', 'HIGH'), t('LOW', 'LOW'), t('قيمة عشوائية', 'Random')], 0, t('مقاومة السحب ترفع الجهد إلى 5V.', 'The pull-up holds it at 5 V.')),
      q(t('لماذا نحتاج مقاومة سحب؟', 'Why is a pull-up needed?'), [t('حتى لا يبقى المدخل عائماً', 'So the input is never floating'), t('لزيادة السرعة', 'For speed')], 0, t('المدخل غير الموصول يلتقط ضجيجاً ويقرأ قيماً عشوائية.', 'An unconnected input picks up noise and reads random values.')),
    ],
  },
  {
    id: 'knob', example: 'demo', track: 'basics',
    title: t('أدر المقبض', 'Turn a knob'),
    summary: t('المقاومة المتغيرة مقسم جهد بمنزلق، تقرؤه analogRead وتتحكم بسطوع LED عبر PWM.', 'A potentiometer is a voltage divider with a slider: analogRead reads it and PWM sets the LED brightness.'),
    goals: [t('قراءة قيمة تناظرية 0–1023', 'Read an analog value 0–1023'), t('تحويل القيم بـ map()', 'Scale values with map()'), t('فهم PWM ودورة العمل', 'Understand PWM and duty cycle')],
    parts: [t('مقاومة متغيرة 10kΩ', '10 kΩ potentiometer'), t('LED ومقاومة', 'LED and resistor'), t('زر وطنان', 'Button and buzzer')],
    steps: [t('الطرفان الخارجيان للمقاومة المتغيرة إلى 5V وGND، والأوسط إلى A0.', 'Outer pot legs to 5 V and GND, the wiper to A0.'), t('شغّل المحاكاة ثم اسحب مقبض المقاومة أو استخدم عجلة الفأرة فوقه.', 'Run, then drag the pot knob or use the mouse wheel on it.'), t('راقب بطاقة «سطوع LED» ودورة PWM في ملخص النتائج.', 'Watch the "LED brightness" card and the PWM duty in the results summary.')],
    explain: [t('analogRead يحوّل 0–5V إلى 0–1023. وanalogWrite يولّد موجة مربعة بتردد ~490Hz، ونسبة زمن HIGH فيها (دورة العمل) تحدد متوسط الجهد.', 'analogRead maps 0–5 V to 0–1023. analogWrite makes a ~490 Hz square wave whose HIGH fraction (duty cycle) sets the average voltage.'), t('map(v, 0, 1023, 0, 255) يحوّل مجال القراءة إلى مجال PWM.', 'map(v, 0, 1023, 0, 255) converts the reading range to the PWM range.')],
    code: [{ line: 'int potValue = analogRead(POT_PIN);', note: t('قراءة المقبض على A0 من 0 إلى 1023.', 'Reads the knob on A0, 0 to 1023.') }, { line: 'analogWrite(LED_PIN, brightness);', note: t('PWM على المنفذ 9 بقيمة 0–255.', 'PWM on pin 9, value 0–255.') }],
    tryIt: t('افتح «مخطط زمني» وراقب كيف تتغير عرض النبضات على D9 حين تدير المقبض.', 'Open the timeline and watch the pulse width on D9 change as you turn the knob.'),
    quiz: [
      q(t('ما أقصى قيمة تعيدها analogRead؟', 'What is the largest value analogRead returns?'), [t('255', '255'), t('1023', '1023'), t('5000', '5000')], 1, t('المحوّل 10 بت: 2^10 − 1 = 1023.', 'The ADC is 10-bit: 2^10 − 1 = 1023.')),
      q(t('دورة عمل 50% على 5V تعطي متوسط جهد:', 'A 50% duty cycle at 5 V averages:'), [t('2.5V', '2.5 V'), t('5V', '5 V'), t('0V', '0 V')], 0, t('المتوسط = دورة العمل × 5V.', 'Average = duty × 5 V.')),
    ],
  },
  {
    id: 'rgb', example: 'rgb', track: 'basics',
    title: t('امزج الألوان', 'Mix colours'),
    summary: t('LED ثلاثي الألوان هو ثلاثة LED تحت عدسة واحدة.', 'An RGB LED is three LEDs under one lens.'),
    goals: [t('التحكم بثلاث قنوات PWM', 'Drive three PWM channels'), t('فهم الكاثود المشترك', 'Understand a common cathode')],
    parts: [t('LED ثلاثي الألوان (كاثود مشترك)', 'RGB LED (common cathode)'), t('3 مقاومات 220Ω', '3 × 220 Ω resistors')],
    steps: [t('الطرف المشترك الأطول إلى GND.', 'The longest (common) leg to GND.'), t('R وG وB كل منها عبر مقاومة إلى المنافذ 9 و10 و11 (PWM).', 'R, G and B each through a resistor to pins 9, 10 and 11 (PWM).'), t('شغّل وراقب تغيّر اللون.', 'Run and watch the colour change.')],
    explain: [t('كل لون يأخذ قيمة من 0 إلى 255، والمزج يعطي أكثر من 16 مليون لون نظرياً. الأحمر مع الأخضر = أصفر.', 'Each colour takes 0–255; mixing gives over 16 million colours in theory. Red plus green makes yellow.')],
    code: [{ line: 'analogWrite(9, r); analogWrite(10, g); analogWrite(11, b);', note: t('شدة الأحمر والأخضر والأزرق من 0 إلى 255.', 'Red, green and blue intensity, 0 to 255.') }],
    tryIt: t('عدّل الكود ليعرض اللون البنفسجي (أحمر + أزرق).', 'Change the code to show purple (red + blue).'),
    quiz: [q(t('الأحمر + الأخضر بكامل الشدة يعطي:', 'Full red + full green gives:'), [t('أصفر', 'Yellow'), t('أزرق', 'Blue'), t('أبيض', 'White')], 0, t('مزج ضوئي إضافي: R + G = أصفر.', 'Additive mixing: R + G = yellow.'))],
  },
  {
    id: 'light', example: 'ldr', track: 'basics',
    title: t('استشعر الضوء', 'Sense light'),
    summary: t('مقاومة ضوئية LDR في مقسم جهد تصنع إنارة ليلية تلقائية.', 'An LDR in a voltage divider makes an automatic night light.'),
    goals: [t('بناء مقسم جهد', 'Build a voltage divider'), t('استخدام عتبة (threshold) لاتخاذ قرار', 'Use a threshold to decide')],
    parts: [t('مقاومة ضوئية LDR', 'Photoresistor (LDR)'), t('مقاومة 10kΩ', '10 kΩ resistor'), t('LED ومقاومة', 'LED and resistor')],
    steps: [t('LDR بين 5V وA0، والمقاومة 10kΩ بين A0 وGND، وLED على المنفذ 10.', 'LDR between 5 V and A0, the 10 kΩ between A0 and GND, the LED on pin 10.'), t('شغّل ثم حدّد LDR وغيّر «شدة الإضاءة» من الخصائص أو بعجلة الفأرة.', 'Run, select the LDR and change "Illuminance" in the inspector or with the mouse wheel.')],
    explain: [t('كلما زاد الضوء قلّت مقاومة LDR فارتفع الجهد على A0. في الظلام يهبط الجهد تحت العتبة فيضيء LED.', 'More light lowers the LDR resistance, raising the voltage on A0. In the dark it drops below the threshold and the LED turns on.')],
    code: [{ line: 'digitalWrite(10, light < 400 ? HIGH : LOW);', note: t('عتبة الظلام.', 'Darkness threshold.') }],
    tryIt: t('غيّر العتبة حتى يضيء LED عند 50 lux.', 'Adjust the threshold so the LED turns on at 50 lux.'),
    quiz: [q(t('عند زيادة الضوء، مقاومة LDR:', 'When the light increases, the LDR resistance:'), [t('تزيد', 'Rises'), t('تقل', 'Falls')], 1, t('LDR يوصل أكثر في الضوء.', 'An LDR conducts more in light.'))],
  },
  {
    id: 'distance', example: 'ultrasonic', track: 'basics',
    title: t('اقرأ حساس المسافة', 'Read a sensor'),
    summary: t('حساس HC-SR04 يرسل نبضة صوتية ويقيس زمن عودة الصدى.', 'The HC-SR04 sends a sound pulse and times the echo.'),
    goals: [t('توليد نبضة TRIG بطول 10µs', 'Send a 10 µs TRIG pulse'), t('قياس النبضة بـ pulseIn', 'Measure with pulseIn'), t('تحويل الزمن إلى مسافة', 'Convert time to distance')],
    parts: [t('حساس HC-SR04', 'HC-SR04 sensor')],
    steps: [t('VCC إلى 5V وGND إلى GND، وTRIG إلى 6 وECHO إلى 5.', 'VCC to 5 V, GND to GND, TRIG to 6, ECHO to 5.'), t('شغّل وغيّر «المسافة» من الخصائص، ثم راقب المراقب التسلسلي.', 'Run, change "Distance" in the inspector and watch the serial monitor.')],
    explain: [t('سرعة الصوت 343m/s أي 0.0343cm/µs. الصوت يذهب ويعود، لذلك المسافة = الزمن × 0.0343 ÷ 2.', 'Sound travels 0.0343 cm/µs and goes there and back, so distance = time × 0.0343 ÷ 2.')],
    code: [{ line: 'long duration = pulseIn(ECHO, HIGH, 30000);', note: t('زمن نبضة الصدى بالميكروثانية.', 'Echo pulse width in µs.') }, { line: 'float cm = duration * 0.0343 / 2.0;', note: t('المسافة بالسنتيمتر.', 'Distance in cm.') }],
    tryIt: t('اطبع «قريب جداً!» عندما تقل المسافة عن 10cm.', 'Print "Too close!" when the distance is under 10 cm.'),
    quiz: [q(t('لماذا نقسم على 2؟', 'Why divide by 2?'), [t('لأن الصوت يذهب ويعود', 'Sound goes there and back'), t('لتحويل الوحدات', 'Unit conversion')], 0, t('الزمن المقاس هو زمن الذهاب والإياب.', 'The measured time is the round trip.'))],
  },
  {
    id: 'sound', example: 'buzzer', track: 'basics',
    title: t('أصدر صوتاً', 'Make a sound'),
    summary: t('الطنان والدالة tone() لعزف لحن.', 'A piezo buzzer and tone() play a melody.'),
    goals: [t('استخدام tone وnoTone', 'Use tone and noTone'), t('فهم العلاقة بين التردد والنغمة', 'Relate frequency to pitch')],
    parts: [t('طنان (Piezo)', 'Piezo buzzer')],
    steps: [t('الطرف الموجب إلى المنفذ 8، والسالب إلى GND.', 'Positive leg to pin 8, negative to GND.'), t('شغّل وراقب بطاقة «تردد الطنان».', 'Run and watch the "Buzzer frequency" card.')],
    explain: [t('tone(pin, f) يولّد موجة مربعة بتردد f. النغمة Do = 262Hz وLa = 440Hz. المحاكي يقيس التردد الفعلي من الإشارة.', 'tone(pin, f) makes a square wave at f. C = 262 Hz, A = 440 Hz. The simulator measures the real frequency from the signal.')],
    code: [{ line: 'tone(8, notes[i], 250);', note: t('النغمة رقم i لمدة 250ms.', 'Note number i for 250 ms.') }],
    tryIt: t('أضف نغمة جديدة إلى المصفوفة notes.', 'Add a new note to the notes array.'),
    quiz: [q(t('أي تردد أعلى نغمة؟', 'Which frequency is the higher pitch?'), [t('262Hz', '262 Hz'), t('523Hz', '523 Hz')], 1, t('كلما زاد التردد ارتفعت النغمة.', 'Higher frequency, higher pitch.'))],
  },
  {
    id: 'piano', example: 'piano', track: 'basics',
    title: t('بيانو صغير', 'Mini piano'),
    summary: t('خمسة مفاتيح وطنان: مصفوفات وحلقات for.', 'Five keys and a buzzer: arrays and for loops.'),
    goals: [t('استخدام المصفوفات', 'Use arrays'), t('حلقة for لقراءة عدة مداخل', 'A for loop over several inputs')],
    parts: [t('5 أزرار', '5 buttons'), t('طنان', 'Buzzer')],
    steps: [t('كل زر بين منفذ (2–6) وGND.', 'Each button between a pin (2–6) and GND.'), t('شغّل ثم اضغط المفاتيح بالفأرة.', 'Run, then press the keys with the mouse.')],
    explain: [t('المصفوفة KEYS تحفظ أرقام المنافذ وNOTES تحفظ الترددات بنفس الترتيب، فالمفتاح i يعزف النغمة i.', 'KEYS holds the pins and NOTES the frequencies in the same order, so key i plays note i.')],
    code: [{ line: 'for (int i = 0; i < 5; i++)', note: t('يمر على المفاتيح الخمسة.', 'Visits the five keys.') }],
    tryIt: t('أضف مفتاحاً سادساً للنغمة La (440Hz) على المنفذ 7.', 'Add a sixth key for A (440 Hz) on pin 7.'),
    quiz: [q(t('ما رقم أول عنصر في مصفوفة C++؟', 'What is the index of the first array element in C++?'), [t('0', '0'), t('1', '1')], 0, t('الفهرسة تبدأ من الصفر.', 'Indexing starts at zero.'))],
  },
  {
    id: 'motor', example: 'motor', track: 'basics',
    title: t('تحكّم بمحرك', 'Control a motor'),
    summary: t('ترانزستور يشغّل محركاً لا يستطيع المنفذ تغذيته مباشرة.', 'A transistor drives a motor the pin cannot power directly.'),
    goals: [t('استخدام ترانزستور NPN كمفتاح', 'Use an NPN transistor as a switch'), t('فهم ثنائي الحماية', 'Understand the flyback diode')],
    parts: [t('محرك DC', 'DC motor'), t('ترانزستور NPN', 'NPN transistor'), t('ثنائي 1N4007', '1N4007 diode'), t('مقاومة 1kΩ', '1 kΩ resistor')],
    steps: [t('المنفذ 3 عبر 1kΩ إلى قاعدة الترانزستور.', 'Pin 3 through 1 kΩ to the transistor base.'), t('المحرك بين 5V والمجمّع، والثنائي بعكس المحرك.', 'Motor between 5 V and the collector, the diode across the motor reversed.'), t('شغّل وراقب سرعة المحرك (rpm).', 'Run and watch the motor speed (rpm).')],
    explain: [t('المحرك يسحب مئات الملي أمبير، والمنفذ يعطي 20mA فقط. تيار صغير في القاعدة يسمح بتيار كبير في المجمّع.', 'The motor draws hundreds of mA; a pin gives only 20 mA. A small base current lets a large collector current flow.'), t('عند الإطفاء يولّد الملف جهداً عكسياً، والثنائي يمرره بأمان.', 'Switching off makes the coil kick back; the diode absorbs it safely.')],
    code: [{ line: 'analogWrite(3, s);', note: t('السرعة s من 0 إلى 255 بـ PWM (180 ≈ 70%).', 'Speed s from 0 to 255 via PWM (180 ≈ 70%).') }],
    tryIt: t('اجعل المحرك يتسارع تدريجياً من 0 إلى 255.', 'Make the motor ramp up from 0 to 255.'),
    quiz: [q(t('لماذا لا نصل المحرك بالمنفذ مباشرة؟', 'Why not connect the motor straight to the pin?'), [t('تياره أكبر من قدرة المنفذ', 'It needs more current than a pin can give'), t('لأنه يعمل بالتيار المتردد', 'It runs on AC')], 0, t('المنفذ محدود بـ 40mA كحد أقصى.', 'A pin is limited to 40 mA.'))],
  },
  {
    id: 'heat', example: 'tmp36', track: 'basics',
    title: t('استشعر الحرارة', 'Sense heat'),
    summary: t('حساس TMP36: 0.5V عند 0°C و10mV لكل درجة.', 'TMP36: 0.5 V at 0 °C, plus 10 mV per degree.'),
    goals: [t('تحويل قراءة ADC إلى جهد ثم إلى درجة حرارة', 'Convert ADC to volts to °C'), t('استخدام float', 'Use float')],
    parts: [t('حساس TMP36', 'TMP36 sensor')],
    steps: [t('الطرف الأيسر 5V، الأوسط A1، الأيمن GND.', 'Left pin 5 V, middle A1, right GND.'), t('شغّل وغيّر درجة الحرارة من الخصائص.', 'Run and change the temperature in the inspector.')],
    explain: [t('V = قراءة × 5 ÷ 1024، ثم T = (V − 0.5) × 100.', 'V = reading × 5 ÷ 1024, then T = (V − 0.5) × 100.')],
    code: [{ line: 'float celsius = (volts - 0.5) * 100.0;', note: t('درجة الحرارة المئوية.', 'Temperature in °C.') }],
    tryIt: t('اطبع الحرارة بالفهرنهايت أيضاً: F = C × 9/5 + 32.', 'Also print Fahrenheit: F = C × 9/5 + 32.'),
    quiz: [q(t('جهد خرج TMP36 عند 25°C:', 'TMP36 output at 25 °C:'), [t('0.75V', '0.75 V'), t('2.5V', '2.5 V')], 0, t('0.5 + 25 × 0.01 = 0.75V.', '0.5 + 25 × 0.01 = 0.75 V.'))],
  },
  {
    id: 'servo', example: 'servo', track: 'basics',
    title: t('حرّك سيرفو', 'Sweep a servo'),
    summary: t('السيرفو يقرأ عرض نبضة كل 20ms ويتحرك إلى الزاوية المقابلة.', 'A servo reads a pulse width every 20 ms and moves to the matching angle.'),
    goals: [t('استخدام مكتبة Servo', 'Use the Servo library'), t('ربط المقاومة المتغيرة بالزاوية', 'Map a pot to an angle')],
    parts: [t('محرك سيرفو', 'Servo motor'), t('مقاومة متغيرة', 'Potentiometer')],
    steps: [t('السلك البني GND، الأحمر 5V، البرتقالي إلى المنفذ 9.', 'Brown GND, red 5 V, orange to pin 9.'), t('شغّل وأدر المقاومة المتغيرة.', 'Run and turn the pot.')],
    explain: [t('نبضة 544µs = 0° و2400µs = 180°. المحاكي يقيس عرض النبضة الحقيقية ويحرك الذراع.', '544 µs = 0°, 2400 µs = 180°. The simulator measures the real pulse and moves the horn.')],
    code: [{ line: 'myServo.write(angle);', note: t('الزاوية من 0 إلى 180.', 'Angle 0–180.') }],
    tryIt: t('اجعل السيرفو يتحرك ذهاباً وإياباً تلقائياً بين 0 و180.', 'Make the servo sweep 0–180 and back on its own.'),
    quiz: [q(t('كل كم ملي ثانية يستقبل السيرفو نبضة؟', 'How often does a servo get a pulse?'), [t('20ms', '20 ms'), t('1s', '1 s')], 0, t('50 نبضة في الثانية.', '50 pulses per second.'))],
  },
  {
    id: 'stepper', example: 'stepper', track: 'basics',
    title: t('أدر العجلة: المحرك الخطوي', 'Spin the wheel: stepper'),
    summary: t('محرك 28BYJ-48 يتحرك خطوة خطوة: 2048 خطوة للدورة.', 'The 28BYJ-48 moves one step at a time: 2048 steps per turn.'),
    goals: [t('فهم تتابع الملفات', 'Understand the coil sequence'), t('استخدام مكتبة Stepper', 'Use the Stepper library')],
    parts: [t('محرك خطوي 28BYJ-48 مع لوحة ULN2003', '28BYJ-48 stepper with ULN2003 board')],
    steps: [t('IN1–IN4 إلى المنافذ 8–11، والتغذية إلى 5V وGND.', 'IN1–IN4 to pins 8–11, power to 5 V and GND.'), t('شغّل وراقب مصابيح الملفات الأربعة وزاوية المحور.', 'Run and watch the four coil LEDs and the shaft angle.')],
    explain: [t('كل خطوة تشغّل ملفين متجاورين فيدور المغناطيس قليلاً. 2048 خطوة = 360°، أي 0.176° للخطوة.', 'Each step energises two neighbouring coils, nudging the rotor. 2048 steps = 360°, 0.176° per step.'), t('ترتيب المنافذ في Stepper(STEPS_PER_REV, 8, 10, 9, 11) مهم حتى يكون التتابع صحيحاً.', 'The pin order in Stepper(STEPS_PER_REV, 8, 10, 9, 11) matters for the right sequence.')],
    code: [{ line: 'motor.step(STEPS_PER_REV);', note: t('دورة كاملة (2048 خطوة).', 'One full turn (2048 steps).') }, { line: 'motor.step(-STEPS_PER_REV / 2);', note: t('نصف دورة للخلف.', 'Half a turn back.') }],
    tryIt: t('اجعله يدور ربع دورة (90°) في كل مرة.', 'Make it turn a quarter (90°) each time.'),
    quiz: [q(t('كم خطوة لربع دورة؟', 'How many steps for a quarter turn?'), [t('512', '512'), t('1024', '1024')], 0, t('2048 ÷ 4 = 512.', '2048 ÷ 4 = 512.'))],
  },
  {
    id: 'screen', example: 'lcd_i2c', track: 'basics',
    title: t('اعرض على شاشة', 'Show it on a screen'),
    summary: t('شاشة LCD عبر I2C بسلكين فقط.', 'An LCD over I2C with just two wires.'),
    goals: [t('فهم ناقل I2C والعناوين', 'Understand the I2C bus and addresses'), t('الكتابة على LCD', 'Write to an LCD')],
    parts: [t('شاشة LCD 16x2 بواجهة I2C', 'I2C LCD 16x2')],
    steps: [t('SDA إلى A4 وSCL إلى A5، والتغذية 5V وGND.', 'SDA to A4, SCL to A5, power 5 V and GND.'), t('شغّل وراقب المراقب التسلسلي: برنامج المسح يجد العنوان 0x27.', 'Run and watch the serial monitor: the scanner finds 0x27.')],
    explain: [t('I2C ناقل بسلكين يتشاركه عدة أجهزة، لكل جهاز عنوان. الشاشة لا ترد إلا إذا كانت موصولة صحيحاً، تماماً كالحقيقة.', 'I2C is a two-wire bus shared by many devices, each with an address. The LCD only answers when wired correctly, just like the real thing.')],
    code: [{ line: 'LiquidCrystal_I2C lcd(0x27, 16, 2);', note: t('العنوان وحجم الشاشة.', 'Address and size.') }, { line: 'lcd.setCursor(0, 1);', note: t('العمود 0 من السطر الثاني.', 'Column 0, second row.') }],
    tryIt: t('احذف سلك SDA وشغّل: ماذا يحدث للمسح وللشاشة؟', 'Delete the SDA wire and run: what happens to the scan and the screen?'),
    quiz: [q(t('كم سلك بيانات يحتاج I2C؟', 'How many data wires does I2C use?'), [t('2', '2'), t('8', '8')], 0, t('SDA للبيانات وSCL للساعة.', 'SDA for data, SCL for clock.'))],
  },
  {
    id: 'force', example: 'fsr', track: 'basics',
    title: t('اشعر بالقوة', 'Feel the force'),
    summary: t('حساس القوة FSR: مقاومة تقل كلما ضغطت أكثر.', 'A force-sensing resistor: harder press, lower resistance.'),
    goals: [t('قراءة حساس مقاومة متغيرة', 'Read a resistive sensor'), t('تصنيف القراءات إلى مستويات', 'Classify readings into levels')],
    parts: [t('حساس FSR', 'FSR sensor'), t('مقاومة 10kΩ', '10 kΩ resistor'), t('LED ومقاومة', 'LED and resistor')],
    steps: [t('FSR بين 5V وA0، و10kΩ بين A0 وGND.', 'FSR between 5 V and A0, 10 kΩ between A0 and GND.'), t('شغّل وغيّر «قوة الضغط» من الخصائص أو بعجلة الفأرة.', 'Run and change "Force" in the inspector or with the mouse wheel.')],
    explain: [t('بلا ضغط تكون مقاومته عدة ميغا أوم فتقرأ A0 قرب الصفر. عند 1kg تصبح ~2.5kΩ فترتفع القراءة.', 'Untouched it is several MΩ so A0 reads near zero; at 1 kg it is ~2.5 kΩ and the reading rises.')],
    code: [{ line: 'if (raw < 10) ... else if (raw < 300) ...', note: t('مستويات الضغط.', 'Pressure levels.') }],
    tryIt: t('أضف مستوى «ضغط شديد جداً» فوق 900.', 'Add a "very hard" level above 900.'),
    quiz: [q(t('عند زيادة الضغط على FSR تصبح قراءة A0:', 'More force on the FSR makes the A0 reading:'), [t('أكبر', 'Larger'), t('أصغر', 'Smaller')], 0, t('المقاومة تقل فيرتفع الجهد على A0.', 'Lower resistance raises the voltage at A0.'))],
  },
  {
    id: 'project', example: 'smart_traffic', track: 'basics',
    title: t('ابنِ مشروعاً', 'Build a project'),
    summary: t('حساس مسافة مع إشارة مرور تخبر السائق متى يتوقف.', 'A distance sensor plus a traffic light that tells a driver when to stop.'),
    goals: [t('دمج حساس ومخارج متعددة', 'Combine a sensor with several outputs'), t('كتابة دوال خاصة بك', 'Write your own functions')],
    parts: [t('حساس HC-SR04', 'HC-SR04'), t('3 LED (أحمر وأصفر وأخضر) و3 مقاومات', '3 LEDs (red, yellow, green) and 3 resistors')],
    steps: [t('الحساس على المنفذين 5 و6، والإشارة على 10 و11 و12.', 'Sensor on pins 5 and 6, lights on 10, 11 and 12.'), t('شغّل وغيّر المسافة: أكثر من 50cm أخضر، 20–50 أصفر، أقل من 20 أحمر.', 'Run and change the distance: over 50 cm green, 20–50 yellow, under 20 red.')],
    explain: [t('الدالة readCm() تخفي تفاصيل الحساس، والدالة show() تضبط المصابيح الثلاثة بسطر واحد. تقسيم البرنامج إلى دوال يجعله أوضح.', 'readCm() hides the sensor details and show() sets the three lights in one line. Splitting a sketch into functions makes it clearer.')],
    code: [{ line: 'float readCm() { ... }', note: t('دالة تعيد المسافة.', 'Returns the distance.') }, { line: 'show(HIGH, LOW, LOW);', note: t('أحمر فقط.', 'Red only.') }],
    tryIt: t('أضف طناناً يصفّر عندما يصبح الضوء أحمر.', 'Add a buzzer that beeps when the light turns red.'),
    quiz: [q(t('عند مسافة 35cm أي ضوء يضيء؟', 'At 35 cm which light is on?'), [t('الأصفر', 'Yellow'), t('الأخضر', 'Green'), t('الأحمر', 'Red')], 0, t('35 بين 20 و50.', '35 is between 20 and 50.'))],
  },
  // ---------- further practice ----------
  {
    id: 'fade', example: 'fade', track: 'more',
    title: t('تلاشي الإضاءة بـ PWM', 'Fade with PWM'), summary: t('زيادة وإنقاص السطوع تدريجياً.', 'Ramp brightness up and down.'),
    goals: [t('حلقة تغيّر قيمة PWM', 'Loop over PWM values')], parts: [t('LED ومقاومة', 'LED and resistor')],
    steps: [t('LED على المنفذ 9.', 'LED on pin 9.')], explain: [t('كل خطوة صغيرة في دورة العمل تغيّر السطوع قليلاً.', 'Each small duty step changes brightness a little.')],
    code: [{ line: 'analogWrite(9, brightness);', note: t('السطوع الحالي.', 'Current brightness.') }], tryIt: t('اجعل التلاشي أبطأ مرتين.', 'Make the fade twice as slow.'),
    quiz: [q(t('أقصى قيمة لـ analogWrite:', 'Largest analogWrite value:'), [t('255', '255'), t('1023', '1023')], 0, t('PWM بدقة 8 بت.', 'PWM is 8-bit.'))],
  },
  {
    id: 'dht', example: 'dht11', track: 'more',
    title: t('الحرارة والرطوبة DHT11', 'Temperature & humidity DHT11'), summary: t('بروتوكول السلك الواحد بتوقيتات دقيقة.', 'A single-wire protocol with precise timing.'),
    goals: [t('استخدام مكتبة DHT', 'Use the DHT library')], parts: [t('حساس DHT11', 'DHT11 sensor')],
    steps: [t('DATA إلى المنفذ 7.', 'DATA to pin 7.')], explain: [t('الحساس يرد بـ 40 بت: الرطوبة والحرارة ومجموع تحقق.', 'The sensor answers with 40 bits: humidity, temperature and a checksum.')],
    code: [{ line: 'dht.readTemperature();', note: t('درجة الحرارة.', 'Temperature.') }], tryIt: t('اعرض تحذيراً إذا تجاوزت الرطوبة 70%.', 'Warn when humidity exceeds 70%.'),
    quiz: [q(t('كم بت يرسل DHT11؟', 'How many bits does a DHT11 send?'), [t('40', '40'), t('8', '8')], 0, t('5 بايتات.', '5 bytes.'))],
  },
  {
    id: 'shift', example: 'shift595', track: 'more',
    title: t('مسجل الإزاحة و SPI', 'Shift register & SPI'), summary: t('8 مخارج من 3 أسلاك عبر 74HC595.', '8 outputs from 3 wires with a 74HC595.'),
    goals: [t('فهم الإزاحة والتثبيت', 'Understand shift and latch')], parts: [t('74HC595', '74HC595'), t('شاشة 7 مقاطع', '7-segment display')],
    steps: [t('DS إلى 11 وSHCP إلى 13 وSTCP إلى 10.', 'DS to 11, SHCP to 13, STCP to 10.')], explain: [t('8 نبضات ساعة تُدخل 8 بتات، ثم نبضة التثبيت تنقلها إلى المخارج دفعة واحدة.', 'Eight clock pulses shift in eight bits; the latch pulse moves them to the outputs at once.')],
    code: [{ line: 'SPI.transfer(pattern);', note: t('يرسل بايت.', 'Sends a byte.') }], tryIt: t('اعرض العد التنازلي من 9 إلى 0.', 'Count down from 9 to 0.'),
    quiz: [q(t('ما وظيفة STCP؟', 'What does STCP do?'), [t('تثبيت المخارج', 'Latches the outputs'), t('مسح المسجل', 'Clears the register')], 0, t('الحافة الصاعدة تنسخ المسجل إلى المخارج.', 'Its rising edge copies the register to the outputs.'))],
  },
  {
    id: 'rc', example: 'rc', track: 'more',
    title: t('شحن المكثف RC', 'RC charging'), summary: t('الاستجابة الزمنية لمقاومة ومكثف.', 'Time response of a resistor and capacitor.'),
    goals: [t('فهم ثابت الزمن τ = RC', 'Understand τ = RC')], parts: [t('مقاومة ومكثف', 'Resistor and capacitor')],
    steps: [t('افتح «مخطط زمني» وراقب منحنى الجهد.', 'Open the timeline and watch the voltage curve.')], explain: [t('بعد τ يصل الجهد إلى 63.2% من النهائي.', 'After τ the voltage reaches 63.2% of its final value.')],
    code: [{ line: 'analogRead(A0)', note: t('قراءة جهد المكثف.', 'Reads the capacitor voltage.') }], tryIt: t('ضاعف قيمة المكثف وقِس τ الجديد.', 'Double the capacitor and measure the new τ.'),
    quiz: [q(t('في المثال R = 10kΩ وC = 100µF، فإن τ =', 'In the example R = 10 kΩ, C = 100 µF, so τ ='), [t('1ms', '1 ms'), t('1s', '1 s')], 1, t('10000 × 0.0001 = 1s.', '10000 × 0.0001 = 1 s.'))],
  },
];

export function lessonDone(p: { quiz?: boolean; ran?: boolean } | undefined) { return !!p?.quiz && !!p?.ran; }

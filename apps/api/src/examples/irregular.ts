/** Reviewed base/past/participle spellings; no reverse lemmatization or sense claims.
 * References: British Council English grammar reference /irregular-verbs and
 * Purdue OWL /general_writing/grammar/irregular_verbs. Alternatives are bounded.
 */
const rows = `
arise arose arisen
be was were been am is are
bear bore borne born
beat beat beaten
become became become
begin began begun
bend bent bent
bet bet bet
bind bound bound
bite bit bitten
bleed bled bled
blow blew blown
break broke broken
breed bred bred
bring brought brought
broadcast broadcast broadcast
build built built
burn burnt burned
burst burst burst
buy bought bought
cast cast cast
catch caught caught
choose chose chosen
cling clung clung
come came come
cost cost cost
creep crept crept
cut cut cut
deal dealt dealt
dig dug dug
do did done does
draw drew drawn
dream dreamt dreamed
drink drank drunk
drive drove driven
eat ate eaten
fall fell fallen
feed fed fed
feel felt felt
fight fought fought
find found found
flee fled fled
fly flew flown
forbid forbade forbidden
forecast forecast forecast
foresee foresaw foreseen
forget forgot forgotten
forgive forgave forgiven
freeze froze frozen
get got gotten
give gave given
go went gone goes
grind ground ground
grow grew grown
hang hung hung
have had had has
hear heard heard
hide hid hidden
hit hit hit
hold held held
hurt hurt hurt
keep kept kept
kneel knelt kneeled
know knew known
lay laid laid
lead led led
lean leant leaned
leap leapt leaped
learn learnt learned
leave left left
lend lent lent
let let let
lie lay lain
light lit lighted
lose lost lost
make made made
mean meant meant
meet met met
mislead misled misled
mistake mistook mistaken
misunderstand misunderstood misunderstood
overcome overcame overcome
overtake overtook overtaken
pay paid paid
prove proved proven
put put put
quit quit quit
read read read
rebuild rebuilt rebuilt
redo redid redone
repay repaid repaid
retell retold retold
rewrite rewrote rewritten
ride rode ridden
ring rang rung
rise rose risen
run ran run
say said said
see saw seen
seek sought sought
sell sold sold
send sent sent
set set set
sew sewed sewn
shake shook shaken
shave shaved shaven
shed shed shed
shine shone shone
shoot shot shot
show showed shown
shrink shrank shrunk
shut shut shut
sing sang sung
sink sank sunk
sit sat sat
sleep slept slept
slide slid slid
smell smelt smelled
speak spoke spoken
speed sped speeded
spell spelt spelled
spend spent spent
spill spilt spilled
spin spun spun
split split split
spoil spoilt spoiled
spread spread spread
spring sprang sprung
stand stood stood
steal stole stolen
stick stuck stuck
sting stung stung
stink stank stunk
strike struck struck
string strung strung
swear swore sworn
sweep swept swept
swim swam swum
swing swung swung
take took taken
teach taught taught
tear tore torn
tell told told
think thought thought
throw threw thrown
undergo underwent undergone
understand understood understood
undertake undertook undertaken
undo undid undone
upset upset upset
wake woke woken
wear wore worn
weep wept wept
win won won
wind wound wound
withdraw withdrew withdrawn
withstand withstood withstood
write wrote written
`;
export const irregularVerbs: ReadonlyMap<string, readonly string[]> = new Map(
  rows
    .trim()
    .split('\n')
    .map((row) => {
      const [base, ...forms] = row.split(' ');
      return [base!, [...new Set(forms)]];
    }),
);

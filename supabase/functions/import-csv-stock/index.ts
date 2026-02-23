import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CSV_DATA = `SOLD,iphone 11,64,Black,resmi_bc,352915113733474,minus,4599000,2026-01-04
SOLD,iphone 11,128,White,resmi_bc,352975119528815,no_minus,5149000,2026-01-20
SOLD,iphone 11,128,White,resmi_bc,356585105753909,minus,5099000,2026-01-20
SOLD,iphone 11,128,White,resmi_bc,356598107750294,no_minus,5150000,2026-01-24
SOLD,iphone 11,128,White,resmi_bc,356596103377872,no_minus,5099000,2026-01-24
COMING SOON,iphone 11,128,White,resmi_bc,CS-IP11-128-W-01,no_minus,,
COMING SOON,iphone 11,128,White,resmi_bc,CS-IP11-128-W-02,no_minus,,
COMING SOON,iphone 11,128,White,resmi_bc,CS-IP11-128-W-03,no_minus,,
COMING SOON,iphone 11,128,Purple,resmi_bc,CS-IP11-128-P-01,no_minus,,
COMING SOON,iphone 11,128,White,resmi_bc,CS-IP11-128-W-04,no_minus,,
COMING SOON,iphone 11,128,White,resmi_bc,CS-IP11-128-W-05,no_minus,,
,iphone 11,128,White,resmi_bc,356591103976351,no_minus,5150000,2026-02-10
,iphone 11,128,White,resmi_bc,352973113281200,no_minus,5150000,2026-02-10
REPAIR,iphone 11 Pro,512,Gold,resmi_bc,CS-IP11P-512-G-01,no_minus,6400000,
REPAIR,iphone 11 Pro,256,Silver,resmi_bc,CS-IP11P-256-S-01,no_minus,5599000,
,iphone 11 Pro,256,Green,resmi_bc,353243106608119,minus,5499000,2026-02-18
,iphone 11 Pro,256,Grey,resmi_bc,353840105268454,minus,5499000,2026-02-18
,iphone 11 Pro,256,Gold,resmi_bc,353239104703969,minus,5949000,2026-02-19
,iphone 11 Pro,64,Green,resmi_bc,352827114935117,minus,5449000,2026-02-19
REPAIR,iphone 11 Pro Max,256,Silver,resmi_bc,353922100843786,no_minus,6700000,2026-02-19
,iphone 11 Pro Max,64,Green,resmi_bc,352865111078416,minus,5899000,2026-01-04
,iphone 11 Pro Max,256,Grey,resmi_bc,353906106088587,no_minus,6700000,2026-02-07
,iphone 12,128,Green,resmi_bc,354710125467536,no_minus,5899000,2026-02-07
SOLD,iphone 12,128,White,resmi_bc,359379490961518,no_minus,5899000,2026-02-07
,iphone 12,256,Red,resmi_bc,353044118990150,no_minus,6200000,2026-02-13
SOLD,iphone 11,64,Purple,ibox,354003101067920,minus,4400000,2026-01-24
SOLD,iphone 11,64,White,resmi_bc,356798115632795,no_minus,4600000,2026-01-24
SOLD,iphone 11 Pro,256,Green,resmi_bc,353236109336225,no_minus,5999000,2026-02-07
,iphone 12 Mini,128,Green,resmi_bc,353014115305066,minus,5649000,2026-02-19
SOLD,iphone 11 Pro,256,Gold,resmi_bc,353845104216453,minus,5699000,2026-01-13
SOLD,iphone 11 Pro,256,Green,resmi_bc,353238102128658,no_minus,5999000,2026-01-21
SOLD,iphone 12 Pro Max,128,Gold,resmi_bc,353730398844105,no_minus,7999000,2026-02-04
SOLD,iphone 11 Pro Max,256,Green,resmi_bc,352855112287223,no_minus,6700000,2026-02-04
SOLD,iphone 13,128,Pink,resmi_bc,355611229353078,minus,6816000,2026-02-02
SOLD,iphone 13,128,White,resmi_bc,356199678829813,no_minus,6950000,2026-02-13
SOLD,iphone 12,128,Green,resmi_bc,354032285602137,no_minus,5899000,2026-01-28
SOLD,iphone 14 Pro Max,256,Purple,resmi_bc,356948356709766,no_minus,13399000,2026-02-13
SOLD,iphone 11,64,White,ibox,357933834415391,no_minus,4700000,2026-02-08
,iphone 12 Mini,128,Blue,resmi_bc,355053350497632,minus,5649000,2026-02-19
,iphone 12 Pro,256,Gold,resmi_bc,356689119627941,minus,7199000,2025-12-08
,iphone 12 Pro,128,Blue,resmi_bc,351194960371173,no_minus,6799000,2026-01-28
,iphone 12 Pro,128,Blue,resmi_bc,356682116566485,no_minus,6799000,2026-01-28
SOLD,ipad A16 (Gen 11),128,Silver,inter,10001,minus,4399000,2025-11-18
SOLD,iphone 11,128,White,resmi_bc,356600101414263,no_minus,5199000,2025-11-04
SOLD,iphone 11,256,White,resmi_bc,356545107183661,no_minus,5399000,2025-11-04
SOLD,iphone 11,128,White,resmi_bc,356878113317555,no_minus,5149000,2025-11-03
SOLD,iphone 11,64,White,ibox,351037755330237,minus,4599000,2025-11-10
SOLD,iphone 11,128,White,resmi_bc,356600108372100,no_minus,5149000,2025-11-03
SOLD,iphone 11,128,White,resmi_bc,352975114699058,no_minus,5199000,2025-11-03
SOLD,iphone 11,128,White,resmi_bc,356328102595316,no_minus,5199000,2025-11-03
SOLD,iphone 11,128,White,resmi_bc,356341109610574,no_minus,5000000,2025-11-18
SOLD,iphone 11,128,Green,resmi_bc,356591103003560,minus,4200000,2025-11-04
SOLD,iphone 11,256,Purple,resmi_bc,353967107843545,no_minus,5399000,2025-11-04
SOLD,iphone 11,64,Black,resmi_bc,353988100211191,no_minus,4599000,2025-11-30
SOLD,iphone 11,64,Red,resmi_bc,356567109056554,minus,4500000,2025-12-08
SOLD,iphone 11,128,Purple,resmi_bc,358358831160759,no_minus,5149000,2025-12-26
SOLD,iphone 11,128,White,resmi_bc,355640711511471,no_minus,5149000,2025-12-26
SOLD,iphone 11,128,White,resmi_bc,352975114760025,no_minus,5150000,2025-11-03
SOLD,iphone 11,64,White,resmi_bc,353973105296298,minus,4399000,2025-11-10
SOLD,iphone 11,128,White,resmi_bc,356600109759776,no_minus,5149000,
SOLD,iphone 11,64,Black,resmi_bc,356856113865567,no_minus,4499000,2026-01-04
SOLD,iphone 11,128,White,resmi_bc,359119173116414,no_minus,5149000,
SOLD,iphone 11,128,White,resmi_bc,356877110256972,no_minus,5149000,2026-01-01
SOLD,iphone 11,128,White,resmi_bc,356587109435137,minus,5099000,2025-12-26
SOLD,iphone 11 Pro,256,White,resmi_bc,353832105373293,minus,5999000,2025-11-04
SOLD,iphone 11 Pro,512,Gold,resmi_bc,353247104535026,minus,5999000,2025-11-04
SOLD,iphone 11 Pro,256,Green,resmi_bc,353250103560805,no_minus,5999000,2025-11-04
SOLD,iphone 11 Pro,64,Green,resmi_bc,353246108120363,minus,4899000,2025-11-13
SOLD,iphone 11 Pro,256,Green,resmi_bc,353234108414747,no_minus,5700000,2025-11-30
SOLD,iphone 11 Pro,256,Grey,resmi_bc,353238109442565,minus,5399000,2025-11-03
SOLD,iphone 11 Pro,256,Grey,resmi_bc,353237104544961,minus,4700000,2025-11-03
SOLD,iphone 11 Pro,512,White,resmi_bc,353244109994068,no_minus,6299000,2025-11-03
SOLD,iphone 11 Pro,256,Green,resmi_bc,353248104982937,minus,5699000,2025-11-30
SOLD,iphone 11 Pro,256,Green,whitelist,353832106126187,minus,4999000,2025-12-24
SOLD,iphone 11 Pro,256,Gold,resmi_bc,354449447513772,no_minus,5900000,2025-12-22
SOLD,iphone 11 Pro,256,Gold,resmi_bc,353845104216453,minus,5699000,2025-12-27
SOLD,iphone 11 Pro,64,Silver,resmi_bc,353867101210453,minus,4999000,2026-01-11
SOLD,iphone 11 Pro,256,Green,resmi_bc,353234108414747,minus,5699000,2025-12-11
SOLD,iphone 11 Pro Max,256,Gold,resmi_bc,353925103136470,no_minus,6699000,2025-11-03
SOLD,iphone 11 Pro Max,256,Grey,resmi_bc,353948102815563,no_minus,6568000,2025-12-20
SOLD,iphone 11 Pro Max,256,Gold,resmi_bc,353893100924092,minus,6499000,2025-12-27
SOLD,iphone 11 Pro Max,512,Gold,resmi_bc,353899102892906,minus,6999000,2026-01-13
SOLD,iphone 12,128,Purple,resmi_bc,350839221827261,no_minus,5899000,2025-11-03
SOLD,iphone 12,128,Green,resmi_bc,352011861997089,no_minus,5899000,2025-11-03
SOLD,iphone 12,128,Purple,resmi_bc,353042115974318,no_minus,5899000,2026-01-18
SOLD,iphone 12,64,White,resmi_bc,353047114423308,no_minus,5399000,2026-01-06
SOLD,iphone 12,128,Blue,ibox,356427675097989,minus,5999000,2026-01-21
SOLD,iphone 12 Mini,128,White,resmi_bc,353013118153523,no_minus,5499000,2025-11-03
SOLD,iphone 12 Mini,64,Red,ibox,356015901619997,no_minus,4730000,2025-11-18
SOLD,iphone 12 Mini,64,Purple,resmi_bc,352755880479277,no_minus,4699000,2025-11-17
SOLD,iphone 12 Pro,128,Gold,resmi_bc,355513310512853,no_minus,6800000,2025-11-27
SOLD,iphone 12 Pro,256,White,digimap,355306400719417,minus,5499000,2025-11-04
SOLD,iphone 12 Pro,512,Blue,resmi_bc,351001682889574,no_minus,7999000,2025-11-04
SOLD,iphone 12 Pro,128,Grey,resmi_bc,357171850749738,minus,6799000,2026-01-11
SOLD,iphone 12 Pro Max,128,White,resmi_bc,353776391683925,minus,7799000,2025-11-03
SOLD,iphone 12 Pro Max,256,White,resmi_bc,356720116057418,no_minus,8699000,2025-11-30
SOLD,iphone 12 Pro Max,256,Blue,resmi_bc,351704553688575,no_minus,8699000,2025-12-22
SOLD,iphone 13,128,White,resmi_bc,352678438530351,no_minus,6950000,2025-12-08
SOLD,iphone 13,128,Pink,resmi_bc,350183987927928,no_minus,6950000,2025-11-04
SOLD,iphone 13,128,White,resmi_bc,359045488819170,no_minus,7049000,2025-12-08
SOLD,iphone 13,128,White,resmi_bc,351123629344115,no_minus,6950000,2025-11-04
SOLD,iphone 13,128,White,resmi_bc,356199679307645,no_minus,6950000,2025-11-04
SOLD,iphone 13,256,White,resmi_bc,352615458240164,no_minus,7799000,2025-11-04
SOLD,iphone 13,128,White,digimap,358439169903000,minus,6949000,2025-12-11
SOLD,iphone 13,128,Pink,resmi_bc,351264786200748,no_minus,6950000,2025-12-16
SOLD,iphone 13,128,Pink,resmi_bc,350776596007170,no_minus,6950000,2025-11-04
SOLD,iphone 13,128,White,resmi_bc,356122179273810,no_minus,6950000,2025-11-18
SOLD,iphone 13,128,White,resmi_bc,358691735262622,no_minus,6950000,2025-11-18
SOLD,iphone 13,128,Pink,resmi_bc,357068944277199,no_minus,6950000,2025-11-05
SOLD,iphone 13,128,Pink,resmi_bc,352556220252485,no_minus,6850000,2025-11-07
SOLD,iphone 13,128,Pink,resmi_bc,355402938950655,no_minus,6950000,2025-11-08
SOLD,iphone 13,128,Black,resmi_bc,359628544116101,no_minus,6950000,2025-11-09
SOLD,iphone 13,128,Pink,resmi_bc,350579247592776,no_minus,6950000,2025-11-06
SOLD,iphone 13,128,White,resmi_bc,357068942536323,no_minus,6950000,2025-11-18
SOLD,iphone 13,128,White,resmi_bc,358091654228029,no_minus,6950000,2025-11-27
SOLD,iphone 13,256,Blue,resmi_bc,350294956246321,no_minus,7799000,2025-11-04
SOLD,iphone 13,128,White,resmi_bc,353941302859713,no_minus,6950000,2025-11-27
SOLD,iphone 13,128,Pink,resmi_bc,359451186690287,no_minus,6950000,2025-11-27
SOLD,iphone 13,128,White,resmi_bc,353618266218355,no_minus,7050000,2025-11-27
SOLD,iphone 13,256,White,resmi_bc,359888177720443,no_minus,7799000,2025-11-29
SOLD,iphone 13,128,Pink,resmi_bc,357474408841415,no_minus,6900000,2025-11-29
SOLD,iphone 13,128,Blue,resmi_bc,354455403690546,no_minus,6950000,2025-11-29
SOLD,iphone 13,128,Red,resmi_bc,358743278816650,no_minus,6950000,2025-11-29
SOLD,iphone 13,128,Pink,resmi_bc,355449236820726,no_minus,7049000,2025-12-08
SOLD,iphone 13,128,Pink,resmi_bc,358471235392652,no_minus,7049000,2025-12-08
SOLD,iphone 13,128,White,resmi_bc,351887638606207,no_minus,6885000,2025-12-08
SOLD,iphone 13,128,Pink,resmi_bc,356378511942765,no_minus,6950000,2025-12-08
SOLD,iphone 13,128,White,resmi_bc,356706928181355,no_minus,6950000,2025-12-16
SOLD,iphone 13,256,Black,resmi_bc,352391570536984,minus,7427000,2025-11-04
SOLD,iphone 13,128,White,resmi_bc,350407034976988,no_minus,7050000,2025-12-16
SOLD,iphone 13,128,Pink,resmi_bc,352991731544593,no_minus,6950000,2025-12-21
SOLD,iphone 13,128,Pink,resmi_bc,358538775647719,minus,6899000,2025-12-16
SOLD,iphone 13,128,White,resmi_bc,354551505419204,no_minus,6949000,2025-12-28
SOLD,iphone 13,128,Pink,resmi_bc,356177152847501,minus,6899000,2025-12-21
SOLD,iphone 13,128,Blue,resmi_bc,354739186719071,no_minus,6949000,2025-12-28
SOLD,iphone 13,128,Black,ibox,359433183516079,no_minus,6999000,2025-12-25
SOLD,iphone 13,128,White,resmi_bc,352848537647642,no_minus,6960000,2025-12-21
SOLD,iphone 13,128,White,resmi_bc,359888172298098,no_minus,6950000,2025-12-26
SOLD,iphone 13,256,Pink,resmi_bc,350183984358630,no_minus,7799000,2025-12-26
SOLD,iphone 13,128,Pink,resmi_bc,356858900928210,no_minus,6950000,2025-12-16
SOLD,iphone 13,128,Pink,resmi_bc,355402935852425,minus,6950000,2025-12-21
SOLD,iphone 13,128,Black,resmi_bc,352164239330556,no_minus,6949000,2025-12-26
SOLD,iphone 13,128,Pink,resmi_bc,359144773322139,no_minus,7050000,2026-01-22
SOLD,iphone 13,128,White,resmi_bc,356010302045686,minus,6899000,2026-01-14
SOLD,iphone 13,128,Black,ibox,354158614856613,no_minus,6968000,2026-01-09
SOLD,iphone 13,128,White,resmi_bc,355958936003334,no_minus,7000000,2026-01-13
SOLD,iphone 13,512,Pink,resmi_bc,352615453907544,no_minus,8299000,2026-01-06
SOLD,iphone 13,128,Pink,resmi_bc,355939496335118,no_minus,6950000,2026-01-11
SOLD,iphone 13,128,Pink,resmi_bc,350294952325848,no_minus,6950000,2026-01-14
SOLD,iphone 13,128,Pink,resmi_bc,356815605886960,no_minus,6950000,2026-01-14
SOLD,iphone 13,128,White,resmi_bc,352678438530351,no_minus,6950000,2025-01-10
SOLD,iphone 13,128,Pink,resmi_bc,359888179907030,no_minus,6950000,2026-01-14
SOLD,iphone 13,128,Green,ibox,355611224482922,no_minus,7099000,2026-01-06
SOLD,iphone 13,256,White,ibox,350024064747054,minus,7399000,2026-01-22
SOLD,iphone 13,256,Pink,resmi_bc,350244337712244,no_minus,7799000,2026-01-26
SOLD,iphone 13,128,White,resmi_bc,358785685017125,no_minus,7049000,2026-01-13
SOLD,iphone 13,128,Pink,resmi_bc,353487943949232,no_minus,7049000,2026-01-13
SOLD,iphone 13,128,Blue,resmi_bc,356122178752186,no_minus,6950000,2026-01-14
SOLD,iphone 13,128,White,resmi_bc,351123621746481,no_minus,6950000,2026-01-14
SOLD,iphone 13,256,Pink,resmi_bc,356122170850756,minus,7699000,2026-01-18
SOLD,iphone 13,128,Pink,resmi_bc,359045482119361,no_minus,6800000,2026-01-13
SOLD,iphone 13 Mini,256,Blue,resmi_bc,353410577490844,no_minus,7299000,2025-11-04
SOLD,iphone 13 Mini,128,Pink,resmi_bc,353873780796010,no_minus,6300000,2025-11-03
SOLD,iphone 13 Mini,128,Pink,resmi_bc,353410570164453,no_minus,6399000,2025-11-03
SOLD,iphone 13 Mini,128,Pink,resmi_bc,354084990090314,no_minus,6399000,2025-11-03
SOLD,iphone 13 Mini,128,Black,resmi_bc,353410578574398,no_minus,6399000,2025-11-03
SOLD,iphone 13 Mini,128,Black,resmi_bc,353410579407283,no_minus,6399000,2025-11-03
SOLD,iphone 13 Mini,128,Pink,resmi_bc,353410570106264,no_minus,6340000,2025-11-03
SOLD,iphone 13 Mini,256,Green,ibox,359251349248423,minus,7299000,2025-12-24
SOLD,iphone 13 Pro,128,Gold,resmi_bc,356310700108635,no_minus,8999000,2025-12-08
SOLD,iphone 13 Pro,256,Blue,resmi_bc,353165801220983,no_minus,9699000,2025-11-10
SOLD,iphone 13 Pro,256,Black,resmi_bc,355843800406823,no_minus,9500000,2025-12-19
SOLD,iphone 13 Pro,128,Blue,resmi_bc,359664923461230,no_minus,8999000,2025-12-27
SOLD,iphone 13 Pro,256,Blue,resmi_bc,353879230003501,no_minus,9699000,2025-12-28
SOLD,iphone 13 Pro Max,256,Gold,resmi_bc,358226365756211,no_minus,11599000,2025-11-11
SOLD,iphone 14,128,White,ibox,352725737732533,no_minus,7000000,2025-11-29
SOLD,iphone 14 Pro,256,White,resmi_bc,354542505765274,no_minus,12699000,2025-11-04
SOLD,iphone 14 Pro,128,Gold,ibox,351553262087722,no_minus,11700000,2025-11-18
SOLD,iphone 14 Pro,128,Purple,resmi_bc,353664576543868,no_minus,11499000,2025-11-18
SOLD,iphone 14 Pro,256,Gold,resmi_bc,357712765154967,no_minus,12299000,2025-11-04
SOLD,iphone 14 Pro,128,Purple,resmi_bc,356011262486399,no_minus,11499000,
SOLD,iphone 14 Pro,128,Black,resmi_bc,356240875293161,no_minus,11499000,2026-01-09
SOLD,iphone 14 Pro,128,White,resmi_bc,359712288997981,no_minus,11436000,2026-01-09
SOLD,iphone 14 Pro,128,White,resmi_bc,353664571082391,no_minus,11499000,2026-01-09
SOLD,iphone 14 Pro Max,256,Black,ibox,357173346427499,no_minus,13399000,2025-11-04
SOLD,iphone 14 Pro Max,256,Gold,resmi_bc,358540302158095,no_minus,13399000,2025-12-21
SOLD,iphone 15,128,Pink,ibox,354278704572886,minus,9699000,2025-12-28
SOLD,iphone 15,128,Blue,ibox,351240617453342,no_minus,9580000,2025-11-04
SOLD,iphone 15,128,Blue,ibox,351240614708557,no_minus,9599000,2025-11-26
SOLD,iphone 15,128,Black,ibox,359255387915694,no_minus,9599000,2025-11-25
SOLD,iphone 15,128,Blue,ibox,350355617887355,no_minus,9399000,2025-11-27
SOLD,iphone 15,128,Pink,ibox,350571688547880,no_minus,9699000,2025-12-08
SOLD,iphone 15,128,Black,ibox,351232740090018,no_minus,10300000,2025-12-19
SOLD,iphone 15,128,Black,ibox,354665967550726,no_minus,10300000,2025-12-19
SOLD,iphone 15,128,Blue,ibox,357291741839777,no_minus,9599000,2025-12-24
SOLD,iphone 15,128,Black,ibox,359282709527791,no_minus,9899000,2026-01-04
SOLD,iphone 15,128,Pink,ibox,355334321559290,no_minus,11250000,2026-01-06
SOLD,iphone 17 Pro,256,Orange,ibox,353463675099066,no_minus,22600000,2025-11-30
SOLD,iphone 17 Pro,256,Orange,ibox,351297475197247,no_minus,22899000,2026-01-27
SOLD,iphone X,256,White,whitelist,353052099398244,no_minus,2699000,2025-11-30
SOLD,iphone XR,64,Yellow,resmi_bc,358825090610203,no_minus,3699000,2025-11-30
SOLD,iphone XR,256,White,resmi_bc,353078104400287,minus,4099000,2025-11-04
SOLD,iphone XR,128,Blue,resmi_bc,357379097787136,no_minus,3950000,2025-12-08
SOLD,iphone 13,128,White,resmi_bc,352678437980698,no_minus,6850000,2025-11-18
SOLD,iphone 13 Mini,128,Pink,resmi_bc,354084997846148,minus,6100000,2025-10-11
SOLD,iphone 12 Pro,128,Grey,resmi_bc,354957739759689,no_minus,6850000,2026-01-28
,iphone 12 Pro,512,Gold,resmi_bc,353340480604308,no_minus,7999000,2026-02-03
,iphone 12 Pro Max,256,Blue,resmi_bc,356725118053182,no_minus,8599000,2026-01-04
SOLD,iphone 13,128,Black,ibox,350407032307566,minus,6899000,2026-01-21
COMING SOON,iphone 13,128,White,resmi_bc,CS-IP13-128-W-01,no_minus,6950000,
COMING SOON,iphone 13,128,White,resmi_bc,CS-IP13-128-W-02,no_minus,6950000,
SOLD,iphone 13,256,Pink,resmi_bc,353357678229862,no_minus,7800000,2026-02-07
SOLD,iphone 13,128,Green,ibox,354789235667250,minus,6999000,2026-02-07
COMING SOON,iphone 13,128,Pink,resmi_bc,CS-IP13-128-PK-01,minus,6899000,
SOLD,iphone 13,128,White,resmi_bc,356810805479666,no_minus,7050000,2026-01-22
SOLD,iphone 13,128,White,resmi_bc,354110237791628,no_minus,7050000,2026-01-22
SOLD,iphone 13,128,White,resmi_bc,355958932882335,no_minus,6900000,2026-01-13
SOLD,iphone 13,128,White,resmi_bc,352941880724850,no_minus,6893000,2026-02-02
REPAIR,iphone 13,128,Red,resmi_bc,355160951179707,no_minus,7050000,2026-01-22
,iphone 13,128,Pink,resmi_bc,355103948475366,minus,6949000,2026-01-21
SOLD,iphone 13,256,Pink,resmi_bc,357247398965505,no_minus,7799000,2026-01-29
,iphone 13,128,Pink,resmi_bc,358564385381648,no_minus,7050000,2026-01-22
SOLD,iphone 13,128,White,resmi_bc,353257397861278,no_minus,6950000,2026-02-02
SOLD,iphone 13,128,Pink,resmi_bc,357946224706385,no_minus,7050000,2026-01-22
,iphone 13,128,Pink,resmi_bc,356378514311737,no_minus,7050000,2026-01-22
,iphone 13,128,White,resmi_bc,352848537685899,no_minus,7050000,2026-01-22
,iphone 13,128,Red,resmi_bc,357290409664097,no_minus,7050000,2026-01-22
SOLD,iphone 13,512,Pink,resmi_bc,350038446613735,no_minus,8299000,2026-02-03
,iphone 13,128,Green,resmi_bc,359786906886305,minus,6899000,2026-02-02
,iphone 13,128,Green,resmi_bc,351138105004322,minus,6899000,2026-02-03
,iphone 13,512,White,resmi_bc,353504868368626,no_minus,8299000,2026-02-03
,iphone 13,256,White,resmi_bc,357068949714626,no_minus,7800000,2026-02-07
SOLD,iphone 13,256,Green,resmi_bc,357084340643173,no_minus,7800000,2026-02-13
,iphone 13,128,Pink,resmi_bc,357500964135667,no_minus,6950000,2026-02-13
SOLD,iphone 13,128,Pink,resmi_bc,358824683060207,no_minus,7050000,2026-02-13
SOLD,iphone 13,128,Pink,resmi_bc,358824784338684,no_minus,6950000,2026-02-13
SOLD,iphone 13,128,Pink,resmi_bc,355939496335118,no_minus,6950000,2026-02-13
,iphone 13,128,White,resmi_bc,352848530208715,no_minus,7050000,2026-02-14
,iphone 13,128,Pink,resmi_bc,354190819976383,no_minus,7050000,2026-02-14
,iphone 13,128,Pink,resmi_bc,354727238884233,no_minus,7050000,2026-02-19
SOLD,iphone 13,128,Black,resmi_bc,355178169769846,no_minus,6950000,2026-02-02
SOLD,iphone 13,128,Pink,resmi_bc,350294957180073,no_minus,6950000,2026-02-14
,iphone 13,128,Pink,resmi_bc,351470118472158,no_minus,7050000,2026-02-19
,iphone 13 Mini,128,Black,resmi_bc,353410576944312,no_minus,6199000,2025-11-03
SOLD,iphone 13,128,Black,ibox,355535133595294,no_minus,7299000,2026-01-23
SOLD,iphone 13 Pro,128,Blue,resmi_bc,356942284755082,no_minus,8917000,2026-02-10
,iphone 13 Pro,128,Blue,resmi_bc,353501490463130,no_minus,8999000,2026-02-10
REPAIR,iphone 13 Pro Max,256,Blue,resmi_bc,359836519960573,minus,9999000,2025-12-28
,iphone 13 Pro Max,256,Blue,resmi_bc,351339415267472,no_minus,10800000,2025-12-27
,iphone 14 Plus,128,White,resmi_bc,356806358902146,no_minus,8199000,2026-02-19
SOLD,iphone 14 Pro,256,Purple,resmi_bc,356240876922727,no_minus,12425000,2026-01-14
,iphone 14 Pro,128,Purple,resmi_bc,352130218488624,no_minus,11399000,2026-01-27
,iphone 14 Pro,128,Gold,resmi_bc,352803728476087,no_minus,11399000,2026-01-27
,iphone 14 Pro,128,Silver,resmi_bc,359712288143370,no_minus,11399000,2026-01-27
,iphone 14 Pro,128,Purple,resmi_bc,353115826527821,no_minus,11399000,2026-01-29
SOLD,iphone 14 Pro,512,Gold,resmi_bc,356011263040583,no_minus,13399000,2026-02-03
,iphone 14 Pro,128,Purple,ibox,356378582573267,minus,11399000,2026-02-04
,iphone 14 Pro Max,256,Black,resmi_bc,354132410018256,minus,12999000,2026-02-13
SOLD,iphone 15,128,Pink,ibox,355334321796116,no_minus,11250000,2026-01-06
SOLD,iphone 15,128,Blue,ibox,357498448369491,no_minus,9599000,2026-01-07
,iphone 15,128,Black,ibox,353364148979382,minus,9549000,2026-01-07
,iphone 15,128,Black,ibox,356660803305896,minus,9549000,2026-01-07
SOLD,iphone 15,128,Green,ibox,351095813122772,no_minus,9899000,2026-01-21
,iphone 15,128,Black,ibox,354278700419066,minus,9550000,2026-01-23
SOLD,iphone 15,128,Blue,ibox,351280598491812,no_minus,9599000,2026-01-28
SOLD,iphone 15 Pro,128,Silver,ibox,351253391072790,no_minus,14350000,2026-01-04
,iphone 15,128,Pink,resmi_bc,351260962870585,no_minus,9599000,2026-02-07
,iphone 15 Pro,256,Blue,ibox,356737682348534,no_minus,15499000,2026-01-06
,iphone 15 Pro Max,256,Silver,ibox,356616946553792,no_minus,15999000,2026-02-16
SOLD,iphone 15 Pro Max,256,Black,ibox,354449447513772,no_minus,15960000,2025-12-19
SOLD,iphone 16,128,Pink,ibox,357908795878084,no_minus,13899000,2026-01-06
,iphone 16 Pro Max,256,Silver,ibox,355564846824775,no_minus,17899000,2026-01-26
,iphone 17 Pro,256,Orange,digimap,354890666480534,no_minus,22899000,2026-02-03
,iphone XR,64,Yellow,resmi_bc,357373097000095,no_minus,3700000,2026-02-10
SOLD,iphone XR,64,Black,ibox,352886118857206,minus,3700000,2026-01-24`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const branchId = "f9c66fcb-841f-4966-9afb-5fdbb1513d27"; // Eastern Park

  // Fetch all master products
  const { data: products } = await supabase
    .from("master_products")
    .select("id, series, storage_gb, color, warranty_type")
    .is("deleted_at", null);

  if (!products) return new Response(JSON.stringify({ error: "No products" }), { status: 500, headers: corsHeaders });

  // Normalize series names for matching
  const normalizeSeriesMap: Record<string, string> = {};
  for (const p of products) {
    const key = `${p.series.toLowerCase()}|${p.storage_gb}|${p.color.toLowerCase()}|${p.warranty_type}`;
    normalizeSeriesMap[key] = p.id;
  }

  const lines = CSV_DATA.trim().split("\n");
  const inserted: string[] = [];
  const errors: string[] = [];
  const missingProducts: string[] = [];
  const newProductIds: Record<string, string> = {};

  // Series name normalization
  function normalizeSeries(s: string): string {
    // Capitalize first letter of each word
    return s.trim().split(" ").map(w => {
      if (w.toLowerCase() === "iphone") return "iPhone";
      if (w.toLowerCase() === "ipad") return "iPad";
      if (w.toLowerCase() === "pro") return "Pro";
      if (w.toLowerCase() === "max") return "Max";
      if (w.toLowerCase() === "mini") return "Mini";
      if (w.toLowerCase() === "plus") return "Plus";
      // For things like "A16", "(Gen", "11)" keep as-is but capitalize
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(" ");
  }

  function normalizeColor(c: string): string {
    return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
  }

  // First pass: create missing master products
  for (const line of lines) {
    const parts = line.split(",");
    const series = parts[1].trim();
    const storage = parseInt(parts[2]);
    const color = parts[3].trim();
    const warranty = parts[4].trim();

    const key = `${series.toLowerCase()}|${storage}|${color.toLowerCase()}|${warranty}`;
    if (!normalizeSeriesMap[key] && !newProductIds[key]) {
      // Determine category
      const seriesLower = series.toLowerCase();
      const category = seriesLower.startsWith("ipad") ? "ipad" : 
                       seriesLower.startsWith("iphone") ? "iphone" : "accessory";

      const normalizedSeries = normalizeSeries(series);
      const normalizedColor = normalizeColor(color);

      const { data: newProd, error: insertErr } = await supabase
        .from("master_products")
        .insert({
          series: normalizedSeries,
          storage_gb: storage,
          color: normalizedColor,
          warranty_type: warranty,
          category: category,
          is_active: true,
        })
        .select("id")
        .single();

      if (insertErr) {
        missingProducts.push(`${key}: ${insertErr.message}`);
      } else {
        newProductIds[key] = newProd.id;
        normalizeSeriesMap[key] = newProd.id;
      }
    }
  }

  // Second pass: insert stock units
  const stockRows: any[] = [];
  for (const line of lines) {
    const parts = line.split(",");
    const statusRaw = parts[0].trim();
    const series = parts[1].trim();
    const storage = parseInt(parts[2]);
    const color = parts[3].trim();
    const warranty = parts[4].trim();
    const imei = parts[5].trim();
    const conditionRaw = parts[6].trim();
    const priceStr = parts[7].trim();
    const dateStr = parts[8]?.trim() || "";

    const key = `${series.toLowerCase()}|${storage}|${color.toLowerCase()}|${warranty}`;
    const productId = normalizeSeriesMap[key];

    if (!productId) {
      errors.push(`No product for: ${key}`);
      continue;
    }

    // Map status
    let stockStatus = "available";
    if (statusRaw === "SOLD") stockStatus = "sold";
    else if (statusRaw === "COMING SOON") stockStatus = "coming_soon";
    else if (statusRaw === "REPAIR") stockStatus = "service";

    // Map condition
    const conditionStatus = conditionRaw === "minus" ? "minus" : "no_minus";

    // Parse price
    const sellingPrice = priceStr ? parseInt(priceStr) : null;

    // Parse date
    let receivedAt: string | null = null;
    if (dateStr) {
      receivedAt = dateStr; // Already in YYYY-MM-DD format
    }

    stockRows.push({
      product_id: productId,
      imei: imei,
      condition_status: conditionStatus,
      selling_price: sellingPrice,
      stock_status: stockStatus,
      received_at: receivedAt || new Date().toISOString().slice(0, 10),
      branch_id: branchId,
      sold_channel: null,
    });
  }

  // Batch upsert in chunks of 50 (skip duplicates by IMEI)
  for (let i = 0; i < stockRows.length; i += 50) {
    const chunk = stockRows.slice(i, i + 50);
    const { error: insertErr, data: insertData } = await supabase
      .from("stock_units")
      .upsert(chunk, { onConflict: "imei", ignoreDuplicates: true })
      .select("id");
    if (insertErr) {
      errors.push(`Chunk ${i}: ${insertErr.message}`);
    } else {
      inserted.push(...(insertData || []).map((d: any) => d.id));
    }
  }

  return new Response(JSON.stringify({
    total_lines: lines.length,
    inserted: inserted.length,
    new_products_created: Object.keys(newProductIds).length,
    missing_products: missingProducts,
    errors: errors,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

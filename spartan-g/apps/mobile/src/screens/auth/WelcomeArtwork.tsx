import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

/** Original vector scenery inspired by the university's red campus canopies.
 * Decorative only: no fetched photos, copied logos or remote asset dependencies. */
export function WelcomeArtwork() {
  return <Svg testID="welcome-campus-art" width="100%" height="100%" viewBox="0 0 360 300" accessible={false} pointerEvents="none">
    <Defs>
      <LinearGradient id="welcomeSky" x1="0" y1="0" x2="0.9" y2="1"><Stop stopColor="#FFF2DE" /><Stop offset="1" stopColor="#F6C8BB" /></LinearGradient>
      <LinearGradient id="welcomeRoof" x1="0" y1="0" x2="1" y2="1"><Stop stopColor="#E5394E" /><Stop offset="1" stopColor="#A90F31" /></LinearGradient>
      <LinearGradient id="welcomeGlass" x1="0" y1="0" x2="0" y2="1"><Stop stopColor="#D4E9E9" /><Stop offset="1" stopColor="#B3CDCB" /></LinearGradient>
      <RadialGradient id="welcomeSun"><Stop stopColor="#FFFBEA" /><Stop offset="1" stopColor="#FFF1CF" stopOpacity="0" /></RadialGradient>
    </Defs>
    <Path d="M37 229C-6 174 15 70 92 31C169-9 291 13 329 86C369 164 342 259 269 274C186 293 83 285 37 229Z" fill="url(#welcomeSky)" />
    <Circle cx="274" cy="69" r="61" fill="url(#welcomeSun)" /><Circle cx="274" cy="69" r="24" fill="#FFF8DC" />
    <Path d="M35 91C39 80 47 78 53 84C57 72 75 71 82 84C91 82 98 86 99 92Z M244 115C247 107 255 106 260 111C267 99 285 100 289 112C301 108 308 113 309 118Z" fill="#FFFDF6" opacity="0.76" />
    <Path d="M17 227Q79 184 140 219Q230 176 344 218L343 254Q191 292 24 251Z" fill="#D4D7B7" />
    <G opacity="0.93">
      <Rect x="221" y="119" width="94" height="111" rx="9" fill="#FFF9EC" />
      <Rect x="230" y="131" width="75" height="65" rx="3" fill="url(#welcomeGlass)" />
      <Path d="M255 131V196M280 131V196M230 152H305M230 175H305" stroke="#FFF9ED" strokeWidth="3" />
      <Path d="M217 118L306 105L322 118L235 132Z" fill="url(#welcomeRoof)" />
      <Path d="M229 201Q265 194 307 201L307 211Q268 205 229 211Z" fill="#CF2C45" />
      <Rect x="261" y="211" width="23" height="22" rx="3" fill="#7E8F8A" />
      <Rect x="49" y="149" width="17" height="89" rx="3" fill="#FAF4E8" /><Rect x="108" y="139" width="14" height="96" rx="3" fill="#FAF4E8" />
      <Path d="M39 143L108 128L140 139L66 156Z" fill="url(#welcomeRoof)" />
      <Path d="M65 156L140 139V147L65 163Z" fill="#9F1832" />
      <Rect x="28" y="119" width="19" height="119" rx="3" fill="#C4B4AB" /><Rect x="31" y="124" width="13" height="39" rx="2" fill="#677877" />
      <Circle cx="37.5" cy="143" r="5" fill="#F7E3D0" /><Circle cx="37.5" cy="143" r="2.5" fill="#BB2440" />
    </G>
    <Path d="M42 221V182M309 222V174" stroke="#B89B7B" strokeWidth="3" strokeLinecap="round" />
    <Path d="M41 193C19 194 21 181 22 179C39 176 43 187 41 193ZM43 203C62 201 64 188 60 187C46 189 42 196 43 203ZM310 188C288 185 288 174 290 171C306 173 311 181 310 188ZM309 197C328 194 332 183 328 181C312 184 309 190 309 197Z" fill="#9FAE87" />
    <Path d="M28 247Q93 224 159 244T335 242Q302 287 182 292Q61 286 28 247Z" fill="#F8E5CC" />
    <Path d="M55 258Q129 240 179 258T308 258" fill="none" stroke="#FFFBEE" strokeWidth="9" strokeLinecap="round" />
    <Ellipse cx="184" cy="270" rx="72" ry="11" fill="#B56F61" opacity="0.16" />
    <Path d="M77 225V185" stroke="#AB7762" strokeWidth="2" strokeLinecap="round" /><Path d="M78 187Q88 184 98 189L94 203Q85 200 78 203Z" fill="#C82040" />
    <Circle cx="80" cy="49" r="3" fill="#D6786A" opacity="0.6" /><Circle cx="321" cy="164" r="3" fill="#E99A7D" /><Circle cx="26" cy="180" r="2" fill="#A6AD7E" />
    <Path d="M304 35V45M299 40H309M58 108V116M54 112H62" stroke="#DA937A" strokeWidth="2" strokeLinecap="round" opacity="0.65" />
  </Svg>;
}

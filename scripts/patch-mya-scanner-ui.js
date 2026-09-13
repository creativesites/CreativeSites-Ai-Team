const fs = require('fs');
const path = require('path');

const chatScreenFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/containers/MyaChatScreen.js');
const messageRowFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/components/Mya/MyaMessageRow.js');

console.log('ChatScreen File:', chatScreenFile);
console.log('MessageRow File:', messageRowFile);

if (!fs.existsSync(chatScreenFile) || !fs.existsSync(messageRowFile)) {
  console.error('Error: Component files not found!');
  process.exit(1);
}

// ==========================================
// 1. PATCH CHAT SCREEN (isImageAnalysis decorator)
// ==========================================
let screenCode = fs.readFileSync(chatScreenFile, 'utf8');

const oldDecoratorCode = `  const data = useMemo(() => {
    const list = Array.isArray(messages) ? messages : [];
    const decorated = list.map((m, i) => ({
      ...m,
      // Label only the first assistant message of a run.
      _showLabel: m.role !== 'user' && (i === 0 || list[i - 1].role === 'user'),
      _key: m.id || \`\${m.role}-\${m.timestamp || ''}-\${i}\`,
    }));
    return decorated.reverse();
  }, [messages]);`;

const newDecoratorCode = `  const data = useMemo(() => {
    const list = Array.isArray(messages) ? messages : [];
    const decorated = list.map((m, i) => {
      // Detect if this specific turn is an image analysis/upload turn (TASK_MSDK_011 / HJ_024)
      const isImageAnalysis = m.role !== 'user' && i > 0 && list[i - 1].role === 'user' && 
        ((list[i - 1].attachments && list[i - 1].attachments.length > 0) || String(list[i - 1].content || '').includes('[Photo Attached:'));
      
      return {
        ...m,
        isImageAnalysis,
        // Label only the first assistant message of a run.
        _showLabel: m.role !== 'user' && (i === 0 || list[i - 1].role === 'user'),
        _key: m.id || \`\${m.role}-\${m.timestamp || ''}-\${i}\`,
      };
    });
    return decorated.reverse();
  }, [messages]);`;

screenCode = screenCode.replace(oldDecoratorCode, newDecoratorCode);
fs.writeFileSync(chatScreenFile, screenCode, 'utf8');
console.log('  ✅ ChatScreen.js decorated successfully!');


// ==========================================
// 2. PATCH MESSAGE ROW (MyaScannerCard)
// ==========================================
let rowCode = fs.readFileSync(messageRowFile, 'utf8');

// Update react-native imports to include Animated, Easing
rowCode = rowCode.replace(
  "import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';",
  "import { View, Text, TouchableOpacity, Image, Animated, Easing, StyleSheet } from 'react-native';"
);

// Define MyaScannerCard component code before styles definition
const scannerComponentCode = `/**
 * MyaScannerCard (TASK_MSDK_011 & HJ_024)
 * High-tech "Scanning Strand DNA..." visual scanner overlay rendered end-to-end
 * while Gemini analyzes the multimodal image pixels on the wire.
 */
export function MyaScannerCard() {
  const scanAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scanAnim]);

  return (
    <View style={scannerStyles.card}>
      <View style={scannerStyles.header}>
        <Ionicons name="sparkles" size={14} color={MyaColors.berry} />
        <Text style={scannerStyles.title}>Scanning Strand DNA...</Text>
      </View>
      <Text style={scannerStyles.sub}>Gemini Multimodal Vision active • Ingesting microscopic metrics...</Text>
      <View style={scannerStyles.container}>
        <Animated.View
          style={[
            scannerStyles.scannerLine,
            {
              transform: [
                {
                  translateY: scanAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 110],
                  }),
                },
              ],
            },
          ]}
        />
        <View style={scannerStyles.skeleton} />
      </View>
    </View>
  );
}

const scannerStyles = StyleSheet.create({
  card: {
    padding: 14,
    backgroundColor: MyaColors.ivory,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: MyaColors.berryLine,
    alignSelf: 'flex-start',
    maxWidth: '86%',
    marginBottom: 8,
    ...MyaShadow.bubble,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: 'Archivo-SemiBold',
    fontSize: 13,
    color: MyaColors.berry,
    marginLeft: 6,
  },
  sub: {
    fontSize: 10,
    color: MyaColors.ink45,
    marginBottom: 10,
  },
  container: {
    height: 110,
    borderRadius: 8,
    backgroundColor: MyaColors.sand,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: MyaColors.ink06,
  },
  scannerLine: {
    height: 2,
    backgroundColor: MyaColors.berry,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
  },
  skeleton: {
    flex: 1,
    backgroundColor: 'rgba(197, 85, 108, 0.05)',
  },
});`;

rowCode = rowCode.replace(
  'function SenderLabel() {',
  `${scannerComponentCode}\n\nfunction SenderLabel() {`
);

// Replace awaitingFirstToken checking inside return block
const oldAwaitingFirstTokenJSX = `{awaitingFirstToken && blocks.length === 0 && <MyaThinkingDots />}`;

const newAwaitingFirstTokenJSX = `{awaitingFirstToken && blocks.length === 0 && (
        message.isImageAnalysis ? <MyaScannerCard /> : <MyaThinkingDots />
      )}`;

rowCode = rowCode.replace(oldAwaitingFirstTokenJSX, newAwaitingFirstTokenJSX);

fs.writeFileSync(messageRowFile, rowCode, 'utf8');
console.log('  ✅ MessageRow.js patched successfully with MyaScannerCard!');

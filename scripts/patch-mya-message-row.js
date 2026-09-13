const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/components/Mya/MyaMessageRow.js');
console.log('Target file:', targetFile);

if (!fs.existsSync(targetFile)) {
  console.error('Error: file not found!');
  process.exit(1);
}

let code = fs.readFileSync(targetFile, 'utf8');

// 1. In assistant path, render assistant attachments if any exist
const oldAssistantReturn = `  return (
    <View style={styles.assistantWrap}>
      {showLabel && <SenderLabel />}

      {awaitingFirstToken && blocks.length === 0 && <MyaThinkingDots />}`;

const newAssistantReturn = `  return (
    <View style={styles.assistantWrap}>
      {showLabel && <SenderLabel />}

      {awaitingFirstToken && blocks.length === 0 && <MyaThinkingDots />}

      {/* Render assistant attachments if they exist (TASK_MSDK_003) */}
      {attachments.map((a, i) => (
        <Image
          key={a.id || a.uri || \`aa-\${i}\`}
          source={{ uri: a.uri }}
          style={styles.assistantAttachment}
        />
      ))}`;

code = code.replace(oldAssistantReturn, newAssistantReturn);

// 2. Add assistantAttachment style
const oldStylePart = `  userAttachment: {
    width: 120,
    height: 120,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: MyaColors.sand,
  },`;

const newStylePart = `  userAttachment: {
    width: 120,
    height: 120,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: MyaColors.sand,
  },
  assistantAttachment: {
    width: 200,
    height: 150,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: MyaColors.sand,
  },`;

code = code.replace(oldStylePart, newStylePart);

fs.writeFileSync(targetFile, code, 'utf8');
console.log('Successfully patched MyaMessageRow.js!');

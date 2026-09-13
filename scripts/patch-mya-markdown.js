const fs = require('fs');
const path = require('path');

const targetFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/components/Mya/MyaMarkdown.js');
console.log('Target file:', targetFile);

if (!fs.existsSync(targetFile)) {
  console.error('Error: file not found!');
  process.exit(1);
}

let code = fs.readFileSync(targetFile, 'utf8');

// 1. Update imports to include Image
code = code.replace(
  "import { View, Text, Linking, StyleSheet } from 'react-native';",
  "import { View, Text, Image, Linking, StyleSheet } from 'react-native';"
);

// 2. Update INLINE regex to capture !? for markdown images
code = code.replace(
  'const INLINE = /(\\*\\*[^*]+\\*\\*|__[^_]+__|\\*[^*\\n]+\\*|_[^_\\n]+_|`[^`]+`|\\[[^\\]]+\\]\\([^)]+\\))/g;',
  'const INLINE = /(!?\\[[^\\]]+\\]\\([^)]+\\)|\\*\\*[^*]+\\*\\*|__[^_]+__|\\*[^*\\n]+\\*|_[^_\\n]+_|`[^`]+`)/g;'
);

// 3. Add imgLink rendering to renderInline
const oldLinkPart = `    const link = /^\\[([^\\]]+)\\]\\(([^)]+)\\)$/.exec(part);
    if (link) {
      const [, label, url] = link;
      return (
        <Text
          key={key}
          style={styles.link}
          accessibilityRole="link"
          onPress={() => Linking.openURL(url).catch(() => {})}
        >
          {label}
        </Text>
      );
    }`;

const newLinkPart = `    const imgLink = /^!\\[([^\\]]+)\\]\\(([^)]+)\\)$/.exec(part);
    if (imgLink) {
      const [, alt, url] = imgLink;
      return (
        <Image
          key={key}
          source={{ uri: url }}
          style={styles.imageAttachment}
          accessibilityLabel={alt}
        />
      );
    }

    const link = /^\\[([^\\]]+)\\]\\(([^)]+)\\)$/.exec(part);
    if (link) {
      const [, label, url] = link;
      return (
        <Text
          key={key}
          style={styles.link}
          accessibilityRole="link"
          onPress={() => Linking.openURL(url).catch(() => {})}
        >
          {label}
        </Text>
      );
    }`;

code = code.replace(oldLinkPart, newLinkPart);

// 4. Add imageAttachment style
const oldStylePart = `  link: {
    color: MyaColors.berry,
    textDecorationLine: 'underline',
  },`;

const newStylePart = `  link: {
    color: MyaColors.berry,
    textDecorationLine: 'underline',
  },
  imageAttachment: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginVertical: 4,
    backgroundColor: MyaColors.sand,
  },`;

code = code.replace(oldStylePart, newStylePart);

fs.writeFileSync(targetFile, code, 'utf8');
console.log('Successfully patched MyaMarkdown.js!');

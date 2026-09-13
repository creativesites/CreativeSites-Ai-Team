const fs = require('fs');
const path = require('path');

const registryFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/components/Mya/rich/registry.js');
const cardsFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/components/Mya/rich/cards.js');
const registerFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/components/Mya/rich/register.js');

console.log('Registry File:', registryFile);
console.log('Cards File:', cardsFile);
console.log('Register File:', registerFile);

if (!fs.existsSync(registryFile) || !fs.existsSync(cardsFile) || !fs.existsSync(registerFile)) {
  console.error('Error: Required component files not found!');
  process.exit(1);
}

// ==========================================
// 1. PATCH REGISTRY (registry.js)
// ==========================================
let regCode = fs.readFileSync(registryFile, 'utf8');

// Add COMMUNITY_POST entry to BlockType
regCode = regCode.replace(
  "  PRODUCT_LIST: 'product_list',",
  "  PRODUCT_LIST: 'product_list',\n  COMMUNITY_POST: 'community_post',"
);

fs.writeFileSync(registryFile, regCode, 'utf8');
console.log('  ✅ Registry patched successfully!');


// ==========================================
// 2. PATCH CARDS (cards.js)
// ==========================================
let cardsCode = fs.readFileSync(cardsFile, 'utf8');

// Insert MyaCommunityPostCard component code before styles definition
const communityCardComponent = `/* ------------------------------------------------------------- COMMUNITY_POST */

export function MyaCommunityPostCard({ data = {}, actions, onAction }) {
  const { id, author, channel, content, timestamp, likesCount: initialLikes = 14, commentsCount = 3 } = data;
  const [likes, setLikes] = React.useState(initialLikes);
  const [liked, setLiked] = React.useState(false);

  if (!content) return null;

  const handleLike = () => {
    if (liked) {
      setLikes(likes - 1);
      setLiked(false);
    } else {
      setLikes(likes + 1);
      setLiked(true);
      if (onAction) {
        onAction({ type: 'like_post', label: 'Like', payload: { postId: id } });
      }
    }
  };

  const handleComment = () => {
    if (onAction) {
      onAction({ type: 'comment_post', label: 'Comment', payload: { postId: id } });
    }
  };

  return (
    <CardShell eyebrow={\`#\${channel || 'community'}\`} icon="people-outline">
      <View style={styles.authorRow}>
        <View style={styles.avatarMini}>
          <Text style={styles.avatarTextMini}>{(author || 'A').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View>
          <Text style={styles.authorName}>@{author || 'Anonymous'}</Text>
          {!!timestamp && <Text style={styles.postDate}>{timestamp.slice(0, 10)}</Text>}
        </View>
      </View>
      
      <CardBody>{content}</CardBody>
      
      <Divider />
      
      <View style={styles.socialActionRow}>
        <TouchableOpacity
          onPress={handleLike}
          style={[styles.socialActionBtn, liked && styles.socialActionBtnLiked]}
          accessibilityRole="button"
          accessibilityLabel="Like community post"
        >
          <Ionicons name={liked ? "heart" : "heart-outline"} size={16} color={liked ? MyaColors.berry : MyaColors.ink55} />
          <Text style={[styles.socialActionText, liked && styles.socialActionTextLiked]}>{likes}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleComment}
          style={styles.socialActionBtn}
          accessibilityRole="button"
          accessibilityLabel="Comment on community post"
        >
          <Ionicons name="chatbubble-outline" size={15} color={MyaColors.ink55} />
          <Text style={styles.socialActionText}>{commentsCount}</Text>
        </TouchableOpacity>
      </View>
    </CardShell>
  );
}`;

cardsCode = cardsCode.replace(
  'const styles = StyleSheet.create({',
  `${communityCardComponent}\n\nconst styles = StyleSheet.create({`
);

// Add styles for author, avatars and social actions inside Stylesheet
const newStyles = `  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarMini: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: MyaColors.blush,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarTextMini: {
    fontFamily: MyaFonts.semibold,
    fontSize: moderateScale(11),
    color: MyaColors.berry,
  },
  authorName: {
    fontFamily: MyaFonts.semibold,
    fontSize: moderateScale(12),
    color: MyaColors.onyx,
  },
  postDate: {
    ...MyaType.quickReply,
    color: MyaColors.ink40,
    fontSize: moderateScale(9),
  },
  socialActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  socialActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: MyaColors.sand,
    marginRight: 8,
  },
  socialActionBtnLiked: {
    backgroundColor: '#fee2e2',
  },
  socialActionText: {
    ...MyaType.quickReply,
    color: MyaColors.ink55,
    marginLeft: 4,
    fontFamily: MyaFonts.semibold,
  },
  socialActionTextLiked: {
    color: MyaColors.berry,
  },
  hero: {`;

cardsCode = cardsCode.replace('  hero: {', newStyles);

fs.writeFileSync(cardsFile, cardsCode, 'utf8');
console.log('  ✅ Cards patched successfully!');


// ==========================================
// 3. PATCH REGISTER (register.js)
// ==========================================
let registerCode = fs.readFileSync(registerFile, 'utf8');

// Import MyaCommunityPostCard
registerCode = registerCode.replace(
  '  MyaGenericCard,\n} from \'./cards\';',
  '  MyaGenericCard,\n  MyaCommunityPostCard,\n} from \'./cards\';'
);

// Map [BlockType.COMMUNITY_POST]: MyaCommunityPostCard
registerCode = registerCode.replace(
  '  [BlockType.NAVIGATION]: MyaNavigationCard,',
  '  [BlockType.COMMUNITY_POST]: MyaCommunityPostCard,\n  [BlockType.NAVIGATION]: MyaNavigationCard,'
);

fs.writeFileSync(registerFile, registerCode, 'utf8');
console.log('  ✅ Register.js patched successfully!');

console.log('\n🎉 Patches complete! Mya Community Post Card integrated on the client-side.\n');

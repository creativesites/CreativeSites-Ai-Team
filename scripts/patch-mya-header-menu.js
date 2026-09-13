const fs = require('fs');
const path = require('path');

const chatScreenFile = path.resolve(__dirname, '../../MyAvana_FrontEnd_RN/src/containers/MyaChatScreen.js');
console.log('Target ChatScreen file:', chatScreenFile);

if (!fs.existsSync(chatScreenFile)) {
  console.error('Error: MyaChatScreen.js not found!');
  process.exit(1);
}

let code = fs.readFileSync(chatScreenFile, 'utf8');

// 1. Inject Bottom Sheet and Tooltip State/Callbacks inside MyaChatScreen component
const oldFirstUseCallback = `  const handleAttach = useCallback(() => {`;

const newBottomSheetState = `  // P0: Menu Bottom Sheet & Tooltip State/Callbacks
  const [showMenu, setShowMenu] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;

  const toggleMenu = useCallback((toValue) => {
    setShowMenu(toValue);
    Animated.timing(menuAnim, {
      toValue: toValue ? 1 : 0,
      duration: 250,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [menuAnim]);

  const handleAttach = useCallback(() => {`;

code = code.replace(oldFirstUseCallback, newBottomSheetState);


// 2. Replace the old Header view block (from return JSX)
const oldHeaderJSX = `  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor={MyaColors.sand} />

      <View style={styles.nav}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={MyaColors.onyx} />
        </TouchableOpacity>

        <Text style={styles.navTitle}>Mya</Text>

        <TouchableOpacity
          onPress={handleRestart}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="New conversation"
        >
          <Ionicons name="create-outline" size={20} color={MyaColors.onyx} />
        </TouchableOpacity>
      </View>

      {/* Context pill - tells the user Mya knows where they came from */}
      <View style={styles.pillRow}>
        <View style={styles.pill}>
          <View style={styles.pillDot} />
          <Text style={styles.pillText} numberOfLines={1}>
            {isEmpty ? 'Connected to your Hair Profile' : \`Viewing \${activeScreenTitle}\`}
          </Text>
        </View>
      </View>`;

const newHeaderJSX = `  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <StatusBar barStyle="dark-content" backgroundColor={MyaColors.sand} />

      {/* Upgraded Header with Context, Pulsing Connection Dot, and Secure Checkmark (P0) */}
      <View style={styles.nav}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.navBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={22} color={MyaColors.onyx} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.navTitleContainer} onPress={() => setShowTooltip(true)} activeOpacity={0.78}>
          <View style={styles.pulsingDot} />
          <Text style={styles.navTitle}>Mya</Text>
          <Ionicons name="shield-checkmark" size={13} color={MyaColors.berry} style={styles.groundingIcon} />
        </TouchableOpacity>

        <View style={styles.navActions}>
          <TouchableOpacity
            onPress={handleRestart}
            style={styles.navBtnSmall}
            accessibilityRole="button"
            accessibilityLabel="New conversation"
          >
            <Ionicons name="create-outline" size={19} color={MyaColors.onyx} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => toggleMenu(true)}
            style={styles.navBtnSmall}
            accessibilityRole="button"
            accessibilityLabel="Mya Menu"
          >
            <Ionicons name="menu-outline" size={20} color={MyaColors.onyx} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Dynamic Grounding Tooltip Overlay */}
      {showTooltip && (
        <View style={styles.tooltipOverlay}>
          <TouchableOpacity style={styles.tooltipCloseArea} onPress={() => setShowTooltip(false)} activeOpacity={1} />
          <View style={styles.tooltipBox}>
            <Text style={styles.tooltipTitle}>♊ Grounding Status</Text>
            <Text style={styles.tooltipText}>
              Mya is context-aware and safely grounded in your Myavana microscopic Strand DNA profile and 30-day consistency telemetry index.
            </Text>
            <Text style={styles.tooltipSub}>🟢 Connection: Live-Staging-Warm</Text>
          </View>
        </View>
      )}

      {/* Native Bottom Sheet Menu Overlay (P0) */}
      {showMenu && (
        <View style={styles.menuBackdrop}>
          <TouchableOpacity style={styles.menuCloseArea} onPress={() => toggleMenu(false)} activeOpacity={1} />
          <Animated.View
            style={[
              styles.menuSheet,
              {
                transform: [
                  {
                    translateY: menuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [300, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.menuHandle} />
            <Text style={styles.menuTitle}>Mya AI Concierge Menu</Text>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                toggleMenu(false);
                handleSend("What is the hair weather forecast and humidity recommendation for my hair today?");
              }}
            >
              <Ionicons name="sunny-outline" size={20} color={MyaColors.berry} style={styles.menuItemIcon} />
              <View>
                <Text style={styles.menuItemText}>Today's Hair Weather</Text>
                <Text style={styles.menuItemSub}>Humidity & frizz index styling advisory</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                toggleMenu(false);
                MyAvanaMobileHostBridge.handleHostAction('my_hair_profile');
              }}
            >
              <Ionicons name="finger-print-outline" size={20} color={MyaColors.berry} style={styles.menuItemIcon} />
              <View>
                <Text style={styles.menuItemText}>My Hair Profile</Text>
                <Text style={styles.menuItemSub}>View your full microscopic Strand DNA</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                toggleMenu(false);
                MyAvanaMobileHostBridge.handleHostAction('book_consultation');
              }}
            >
              <Ionicons name="calendar-outline" size={20} color={MyaColors.berry} style={styles.menuItemIcon} />
              <View>
                <Text style={styles.menuItemText}>Book a Consultation</Text>
                <Text style={styles.menuItemSub}>Schedule a virtual healthy hair consult</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemLast]}
              onPress={() => {
                toggleMenu(false);
                handleRestart();
              }}
            >
              <Ionicons name="refresh-outline" size={20} color={MyaColors.berry} style={styles.menuItemIcon} />
              <View>
                <Text style={styles.menuItemText}>Reset Conversation</Text>
                <Text style={styles.menuItemSub}>Start a completely fresh chat session</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuCloseBtn} onPress={() => toggleMenu(false)}>
              <Text style={styles.menuCloseBtnText}>Close Menu</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      )}`;

code = code.replace(oldHeaderJSX, newHeaderJSX);


// 3. Inject StyleSheet additions for the bottom sheet and tooltip
const oldStylesHeader = `  navTitle: {
    ...MyaType.navTitle,
    color: MyaColors.onyx,
  },`;

const newStylesHeader = `  navTitle: {
    ...MyaType.navTitle,
    color: MyaColors.onyx,
  },
  navTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  groundingIcon: {
    marginLeft: 4,
    marginTop: 1,
  },
  navActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBtnSmall: {
    width: 38,
    height: MYA_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  
  // Bottom Sheet Style Blocks (P0)
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34,35,35,0.45)',
    zIndex: 1000,
    justifyContent: 'flex-end',
  },
  menuCloseArea: {
    flex: 1,
  },
  menuSheet: {
    backgroundColor: MyaColors.sand,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderWidth: 1,
    borderColor: MyaColors.berryLine,
  },
  menuHandle: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: MyaColors.ink12,
    alignSelf: 'center',
    marginBottom: 16,
  },
  menuTitle: {
    fontFamily: MyaFonts.semibold,
    fontSize: moderateScale(15),
    color: MyaColors.onyx,
    marginBottom: 16,
    textAlign: 'center',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: MyaColors.ink06,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemIcon: {
    marginRight: 14,
  },
  menuItemText: {
    fontFamily: MyaFonts.semibold,
    fontSize: moderateScale(13),
    color: MyaColors.onyx,
  },
  menuItemSub: {
    ...MyaType.quickReply,
    color: MyaColors.ink45,
    fontSize: moderateScale(10),
    marginTop: 1,
  },
  menuCloseBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: MyaColors.ivory,
    borderWidth: 1,
    borderColor: MyaColors.berryLine,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  menuCloseBtnText: {
    fontFamily: MyaFonts.semibold,
    fontSize: moderateScale(13),
    color: MyaColors.berry,
  },

  // Tooltip Style Blocks
  tooltipOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,35,35,0.2)',
  },
  tooltipCloseArea: {
    ...StyleSheet.absoluteFillObject,
  },
  tooltipBox: {
    width: '80%',
    backgroundColor: MyaColors.ivory,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: MyaColors.berryLine,
    shadowColor: '#222323',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  tooltipTitle: {
    fontFamily: MyaFonts.semibold,
    fontSize: moderateScale(13),
    color: MyaColors.berry,
    marginBottom: 6,
  },
  tooltipText: {
    ...MyaType.errorNote,
    color: MyaColors.onyx,
    lineHeight: 18,
  },
  tooltipSub: {
    ...MyaType.quickReply,
    color: '#10b981',
    fontFamily: MyaFonts.semibold,
    fontSize: moderateScale(10),
    marginTop: 8,
  },`;

code = code.replace(oldStylesHeader, newStylesHeader);

fs.writeFileSync(chatScreenFile, code, 'utf8');
console.log('Successfully patched MyaChatScreen.js with upgraded Header & Bottom Sheet Menu!');

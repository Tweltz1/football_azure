import { Image, StyleProp, StyleSheet, Text, useColorScheme, View, ViewStyle } from 'react-native';
import { photoUri } from '../lib/recipePhotos';
import type { Recipe } from '../lib/recipes';

// Soft background colors for recipes without a photo, picked by the recipe id so each keeps its color.
const LIGHT = ['#FDE7D7', '#E3F2DF', '#FFF2C7', '#E5ECFB', '#F8E1EC', '#E0F4F1', '#EFE6FA'];
const DARK = ['#3A2618', '#1E3322', '#3A3216', '#1D2639', '#3A1E2C', '#163330', '#2B2139'];

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/** The recipe's own photo (scanned or from its web page), else its emoji on a colored tile. */
export function RecipePicture({ recipe, size, style }: { recipe: Recipe; size: number; style?: StyleProp<ViewStyle> }) {
  const dark = useColorScheme() === 'dark';
  const uri = recipe.photo ? photoUri(recipe.photo) : recipe.imageUrl;
  const palette = dark ? DARK : LIGHT;
  const box = [styles.box, { height: size, backgroundColor: palette[hash(recipe.id) % palette.length] }, style];
  if (uri) {
    return (
      <View style={box}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
      </View>
    );
  }
  return (
    <View style={[box, { alignItems: 'center', justifyContent: 'center' }]} accessibilityElementsHidden>
      <Text style={{ fontSize: size * 0.5 }}>{recipe.emoji ?? (recipe.source === 'mine' ? '📖' : '🍽️')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({ box: { overflow: 'hidden', borderRadius: 14 } });

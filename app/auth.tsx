import { useEffect, useRef, useState } from 'react';
import {
	Animated,
	Alert,
	Modal,
	Pressable,
	StyleSheet,
	TextInput,
	View,
	KeyboardAvoidingView,
	Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
	createUserWithEmailAndPassword,
	sendEmailVerification,
	sendPasswordResetEmail,
	signInWithEmailAndPassword,
	signOut,
} from 'firebase/auth';
import * as Location from 'expo-location';
import { router } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { auth, db } from '@/src/services/firebaseClient';
import { getUserData, createUserAccount } from '@/src/services/userService';

export default function AuthScreen() {
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [isCreateMode, setIsCreateMode] = useState(false);
	const [loading, setLoading] = useState(false);
	const [resending, setResending] = useState(false);
	const [resettingPassword, setResettingPassword] = useState(false);
	const [profileModalVisible, setProfileModalVisible] = useState(false);
	const [profileFirstName, setProfileFirstName] = useState('');
	const [profileLastName, setProfileLastName] = useState('');
	const [profileRadius, setProfileRadius] = useState('5');
	const [profileHomeAddress, setProfileHomeAddress] = useState('');
	const [profileAddressTouched, setProfileAddressTouched] = useState(false);
	const [profileGeocodedAddress, setProfileGeocodedAddress] = useState('');
	const [profileAddressError, setProfileAddressError] = useState('');
	const [profileAddressSuggestions, setProfileAddressSuggestions] = useState<Array<{ displayName: string; latitude: number; longitude: number }>>([]);
	const [isSearchingAddress, setIsSearchingAddress] = useState(false);
	const [addressGuidanceText, setAddressGuidanceText] = useState('');
	const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);
	const [profileCoordinates, setProfileCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
	const [pendingEmail, setPendingEmail] = useState('');
	const [savingProfile, setSavingProfile] = useState(false);
	const [showVerificationScreen, setShowVerificationScreen] = useState(false);
	const [verifyEmail, setVerifyEmail] = useState('');
	const [showResetScreen, setShowResetScreen] = useState(false);
	const [resetEmail, setResetEmail] = useState('');
	const verifyFadeAnim = useRef(new Animated.Value(0)).current;
	const verifySlideAnim = useRef(new Animated.Value(30)).current;

	type UserLocation = {
		latitude: number;
		longitude: number;
	};

	type AddressSuggestion = {
		displayName: string;
		latitude: number;
		longitude: number;
	};

	useEffect(() => {
		if (!profileModalVisible) {
			setProfileAddressSuggestions([]);
			setIsSearchingAddress(false);
			setAddressGuidanceText('');
			return;
		}

		const queryText = profileHomeAddress.trim();
		if (!profileAddressTouched || queryText.length < 3) {
			setProfileAddressSuggestions([]);
			setIsSearchingAddress(false);
			if (profileAddressTouched && queryText.length > 0 && queryText.length < 3) {
				setAddressGuidanceText('Keep typing: include street number, street name, city, and state/province.');
			} else {
				setAddressGuidanceText('');
			}
			return;
		}

		const debounceHandle = setTimeout(async () => {
			try {
				setIsSearchingAddress(true);
				const suggestions = await lookupAddressSuggestions(queryText);
				setProfileAddressSuggestions(suggestions);

				if (suggestions.length === 0) {
					setAddressGuidanceText('No matches yet. Try a more specific address: house number + street + city + state/province (+ postal code).');
				} else {
					setAddressGuidanceText('');
				}
			} catch {
				setProfileAddressSuggestions([]);
				setAddressGuidanceText('Address search is unavailable right now. Enter a full address and use Save to geocode it.');
			} finally {
				setIsSearchingAddress(false);
			}
		}, 350);

		return () => clearTimeout(debounceHandle);
	}, [profileAddressTouched, profileHomeAddress, profileModalVisible]);

	useEffect(() => {
		if (showVerificationScreen || showResetScreen) {
			Animated.parallel([
				Animated.timing(verifyFadeAnim, { toValue: 1, duration: 420, useNativeDriver: true }),
				Animated.timing(verifySlideAnim, { toValue: 0, duration: 380, useNativeDriver: true }),
			]).start();
		} else {
			verifyFadeAnim.setValue(0);
			verifySlideAnim.setValue(30);
		}
	}, [showVerificationScreen, showResetScreen]);

	const geocodeAddress = async (addressText: string): Promise<UserLocation | null> => {
		const geocodeResults = await Location.geocodeAsync(addressText);
		const firstMatch = geocodeResults[0];

		if (!firstMatch) {
			return null;
		}

		return {
			latitude: firstMatch.latitude,
			longitude: firstMatch.longitude,
		};
	};

	const formatSuggestionDisplayName = (item: any): string => {
		const address = item?.address || {};
		const line1 = [
			address.house_number,
			address.road || address.pedestrian || address.footway,
		]
			.filter(Boolean)
			.join(' ')
			.trim();

		const locality =
			address.city ||
			address.town ||
			address.village ||
			address.hamlet ||
			address.municipality ||
			address.locality;

		const parts = [
			line1 || address.road || address.pedestrian || address.footway,
			locality,
			address.state || address.state_district,
			address.postcode,
		].filter(Boolean);

		if (parts.length > 0) {
			return parts.join(', ');
		}

		const excludedSegments = new Set(
			[address.county, address.neighbourhood, address.neighborhood]
				.filter(Boolean)
				.map((value: any) => String(value).toLowerCase())
		);

		return String(item?.display_name || '')
			.split(',')
			.map((segment) => segment.trim())
			.filter((segment) => segment.length > 0 && !excludedSegments.has(segment.toLowerCase()))
			.join(', ');
	};

	const lookupAddressSuggestions = async (queryText: string): Promise<AddressSuggestion[]> => {
		const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(queryText)}`;
		const response = await fetch(url, {
			headers: {
				Accept: 'application/json',
				'User-Agent': 'RetrievedNative/1.0',
			},
		});

		if (!response.ok) {
			throw new Error(`Address search failed with status ${response.status}`);
		}

		const json = await response.json();
		if (!Array.isArray(json)) {
			return [];
		}

		return json
			.map((item: any) => ({
				displayName: formatSuggestionDisplayName(item),
				latitude: Number(item.lat),
				longitude: Number(item.lon),
			}))
			.filter((item: AddressSuggestion) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && item.displayName);
	};

	const selectAddressSuggestion = (suggestion: AddressSuggestion) => {
		setProfileHomeAddress(suggestion.displayName);
		setProfileAddressTouched(true);
		setProfileGeocodedAddress(suggestion.displayName);
		setProfileAddressSuggestions([]);
		setAddressGuidanceText('');
		setProfileAddressError('');
		setProfileCoordinates({
			latitude: suggestion.latitude,
			longitude: suggestion.longitude,
		});
	};

	const previewTypedAddress = async () => {
		const trimmedAddress = profileHomeAddress.trim();
		if (!profileAddressTouched || trimmedAddress.length === 0) {
			return;
		}

		try {
			setIsGeocodingAddress(true);
			const resolvedLocation = await geocodeAddress(trimmedAddress);

			if (!resolvedLocation) {
				setProfileAddressError('Could not find that address. Please enter a more complete address.');
				return;
			}

			setProfileCoordinates(resolvedLocation);
			setProfileGeocodedAddress(trimmedAddress);
			setProfileAddressError('');
		} catch (error: any) {
			setProfileAddressError(error?.message || 'Address lookup failed. Please try again.');
		} finally {
			setIsGeocodingAddress(false);
		}
	};

	const useCurrentLocation = async () => {
		try {
			const permission = await Location.requestForegroundPermissionsAsync();
			if (!permission.granted) {
				Alert.alert('Permission required', 'Location permission is required to use your current location.');
				return;
			}

			const currentPosition = await Location.getCurrentPositionAsync({});
			const currentCoordinates = {
				latitude: currentPosition.coords.latitude,
				longitude: currentPosition.coords.longitude,
			};

			setProfileCoordinates(currentCoordinates);
			setProfileAddressTouched(true);
			setProfileGeocodedAddress('');
			setProfileAddressError('');
			setProfileAddressSuggestions([]);
			setAddressGuidanceText('');

			const reverseResults = await Location.reverseGeocodeAsync(currentCoordinates);
			const firstAddress = reverseResults[0];
			if (firstAddress) {
				const parts = [
					firstAddress.streetNumber,
					firstAddress.street,
					firstAddress.city,
					firstAddress.region,
					firstAddress.postalCode,
				].filter(Boolean);
				const formatted = parts.join(' ');
				setProfileHomeAddress(formatted);
				setProfileGeocodedAddress(formatted);
			}
		} catch (error: any) {
			Alert.alert('Location unavailable', error?.message || 'Could not get your current location.');
		}
	};

	const handleAuth = async () => {
		if (!email.trim() || !password.trim()) {
			Alert.alert('Missing fields', 'Please enter email and password.');
			return;
		}

		setLoading(true);
		try {
			if (isCreateMode) {
				const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
				if (cred.user) {
					await sendEmailVerification(cred.user);
					await signOut(auth);
					setVerifyEmail(email.trim());
					setShowVerificationScreen(true);
				}
			} else {
				const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
				await cred.user.reload();

				if (!cred.user.emailVerified) {
					await signOut(auth);
					Alert.alert('Email not verified', 'Please verify your email before signing in.');
					return;
				}

				const account = await getUserData(db, cred.user.email ?? '');
				if (!account) {
					setPendingEmail(cred.user.email ?? '');
					setProfileFirstName('');
					setProfileLastName('');
					setProfileRadius('5');
					setProfileHomeAddress('');
					setProfileAddressTouched(false);
					setProfileGeocodedAddress('');
					setProfileAddressError('');
					setProfileAddressSuggestions([]);
					setAddressGuidanceText('');
					setProfileCoordinates(null);
					setProfileModalVisible(true);
					return;
				}

				router.replace('/(tabs)' as any);
			}
		} catch (error: any) {
			Alert.alert('Authentication failed', error?.message ?? 'Please try again.');
		} finally {
			setLoading(false);
		}
	};

	const handleSaveProfile = async () => {
		if (!profileFirstName.trim() || !profileLastName.trim() || !profileHomeAddress.trim()) {
			Alert.alert('Missing fields', 'Please enter first name, last name, and home address.');
			return;
		}

		setSavingProfile(true);
		try {
			let nextLocation: UserLocation | null = profileCoordinates;
			const trimmedAddress = profileHomeAddress.trim();

			const wantsAddressUpdate = profileAddressTouched && trimmedAddress.length > 0;
			if (wantsAddressUpdate) {
				const resolvedLocation =
					profileGeocodedAddress === trimmedAddress && profileCoordinates
						? profileCoordinates
						: await geocodeAddress(trimmedAddress);

				if (!resolvedLocation) {
					setProfileAddressError('Could not find that address. Please enter a more complete address.');
					Alert.alert('Address not found', 'Enter a complete address or use your current location.');
					return;
				}

				nextLocation = resolvedLocation;
				setProfileCoordinates(nextLocation);
				setProfileGeocodedAddress(trimmedAddress);
				setProfileAddressError('');
			}

			if (!nextLocation) {
				Alert.alert('Address not found', 'Enter a complete home address so it can be saved as your map location.');
				return;
			}

			await createUserAccount(db, pendingEmail, {
				firstName: profileFirstName.trim(),
				lastName: profileLastName.trim(),
				radius: profileRadius.trim(),
				homeAddress: trimmedAddress,
				location: {
					latitude: nextLocation.latitude,
					longitude: nextLocation.longitude,
				},
			});
			setProfileModalVisible(false);
			router.replace('/(tabs)' as any);
		} catch (error: any) {
			Alert.alert('Error', error?.message ?? 'Could not save profile information.');
		} finally {
			setSavingProfile(false);
		}
	};

	const handleCancelProfileSetup = async () => {
		setProfileModalVisible(false);
		setPendingEmail('');
		setProfileFirstName('');
		setProfileLastName('');
		setProfileRadius('5');
		setProfileHomeAddress('');
		setProfileAddressTouched(false);
		setProfileGeocodedAddress('');
		setProfileAddressError('');
		setProfileAddressSuggestions([]);
		setAddressGuidanceText('');
		setProfileCoordinates(null);
		await signOut(auth);
	};

	const handleVerifiedTap = () => {
		setShowVerificationScreen(false);
		setIsCreateMode(false);
		setPassword('');
	};

	const handleResendVerification = async () => {
		if (!email.trim() || !password.trim()) {
			Alert.alert('Missing fields', 'Enter email and password, then resend verification.');
			return;
		}

		setResending(true);
		try {
			const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
			if (cred.user.emailVerified) {
				Alert.alert('Already verified', 'This account is already verified.');
			} else {
				await sendEmailVerification(cred.user);
				Alert.alert('Verification sent', 'A new verification email has been sent.');
			}
			await signOut(auth);
		} catch (error: any) {
			Alert.alert('Resend failed', error?.message ?? 'Please try again later.');
		} finally {
			setResending(false);
		}
	};

	const handleForgotPassword = async () => {
		const trimmedEmail = email.trim();
		if (!trimmedEmail) {
			Alert.alert('Email required', 'Enter your email address first, then tap reset password.');
			return;
		}

		setResettingPassword(true);
		try {
			await sendPasswordResetEmail(auth, trimmedEmail);
			setResetEmail(trimmedEmail);
			setShowResetScreen(true);
		} catch (error: any) {
			Alert.alert('Reset failed', error?.message ?? 'Could not send reset email right now.');
		} finally {
			setResettingPassword(false);
		}
	};

	const handleResetConfirmedTap = () => {
		setShowResetScreen(false);
		setIsCreateMode(false);
		setPassword('');
	};

	if (showResetScreen) {
		return (
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.verifyOuter}>
					<Animated.View
						style={[
							styles.verifyCard,
							{ opacity: verifyFadeAnim, transform: [{ translateY: verifySlideAnim }] },
						]}>
						<View style={styles.verifyIconCircle}>
							<ThemedText style={styles.verifyIconText}>✓</ThemedText>
						</View>
						<ThemedText style={styles.verifyTitle}>Reset Email Sent</ThemedText>
						<ThemedText style={styles.verifyBody}>
							{'A password reset link has been sent to '}
							<ThemedText style={styles.verifyEmailHighlight}>{resetEmail}</ThemedText>
							{'.'}
						</ThemedText>
						<ThemedText style={styles.verifyInstruction}>
							After changing your password, tap the button below to return to sign in.
						</ThemedText>
						<Pressable style={styles.verifiedButton} onPress={handleResetConfirmedTap}>
							<ThemedText style={styles.verifiedButtonText}>Passwords Been Reset</ThemedText>
						</Pressable>
						<Pressable onPress={handleResetConfirmedTap} style={[styles.linkButton, { marginTop: 10 }]}>
							<ThemedText style={styles.linkText}>Back to sign in</ThemedText>
						</Pressable>
					</Animated.View>
				</View>
			</SafeAreaView>
		);
	}

	if (showVerificationScreen) {
		return (
			<SafeAreaView style={styles.safeArea}>
				<View style={styles.verifyOuter}>
					<Animated.View
						style={[
							styles.verifyCard,
							{ opacity: verifyFadeAnim, transform: [{ translateY: verifySlideAnim }] },
						]}>
						<View style={styles.verifyIconCircle}>
							<ThemedText style={styles.verifyIconText}>✉</ThemedText>
						</View>
						<ThemedText style={styles.verifyTitle}>Check Your Email</ThemedText>
						<ThemedText style={styles.verifyBody}>
							{'An email has been sent to '}
							<ThemedText style={styles.verifyEmailHighlight}>{verifyEmail}</ThemedText>
							{'.'}
						</ThemedText>
						<ThemedText style={styles.verifyInstruction}>
							Please select Verified once you've verified your email.
						</ThemedText>
						<Pressable style={styles.verifiedButton} onPress={handleVerifiedTap}>
							<ThemedText style={styles.verifiedButtonText}>Verified</ThemedText>
						</Pressable>
						<Pressable onPress={handleVerifiedTap} style={[styles.linkButton, { marginTop: 10 }]}>
							<ThemedText style={styles.linkText}>Back to sign in</ThemedText>
						</Pressable>
					</Animated.View>
				</View>
			</SafeAreaView>
		);
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<KeyboardAvoidingView
				style={styles.container}
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
				<View style={[styles.card, isCreateMode && styles.cardCreate]}>
					<View style={[styles.modeAccentBar, isCreateMode ? styles.modeAccentCreate : styles.modeAccentLogin]} />
					<ThemedText style={[styles.title, isCreateMode && styles.titleCreate]}>
						{isCreateMode ? 'Create Account' : 'Sign In'}
					</ThemedText>
					<ThemedText style={styles.subtitle}>
						{isCreateMode
							? 'Enter an email and choose a password to get started.'
							: 'Use email and password. Email verification is required.'}
					</ThemedText>

					<TextInput
						style={styles.input}
						placeholder="Email"
						autoCapitalize="none"
						keyboardType="email-address"
						value={email}
						onChangeText={setEmail}
					/>
					<TextInput
						style={styles.input}
						placeholder="Password"
						secureTextEntry
						value={password}
						onChangeText={setPassword}
					/>

					<Pressable style={styles.primaryButton} onPress={handleAuth} disabled={loading}>
						<ThemedText style={styles.primaryText}>{loading ? 'Please wait...' : isCreateMode ? 'Create Account' : 'Sign In'}</ThemedText>
					</Pressable>

					{!isCreateMode && (
						<Pressable style={styles.secondaryButton} onPress={handleResendVerification} disabled={loading || resending}>
							<ThemedText style={styles.secondaryText}>{resending ? 'Sending...' : 'Resend verification email'}</ThemedText>
						</Pressable>
					)}

					{!isCreateMode && (
						<Pressable style={styles.tertiaryButton} onPress={handleForgotPassword} disabled={loading || resettingPassword}>
							<ThemedText style={styles.tertiaryText}>{resettingPassword ? 'Sending reset link...' : 'Forgot password? Reset it'}</ThemedText>
						</Pressable>
					)}

					<Pressable
						onPress={() => setIsCreateMode((prev) => !prev)}
						disabled={loading}
						style={styles.linkButton}>
						<ThemedText style={styles.linkText}>
							{isCreateMode ? 'Already have an account? Sign in' : 'Need an account? Create one'}
						</ThemedText>
					</Pressable>
				</View>
			</KeyboardAvoidingView>

			<Modal animationType="slide" transparent={true} visible={profileModalVisible} onRequestClose={handleCancelProfileSetup}>
				<View style={styles.modalOverlay}>
					<View style={styles.modalContent}>
						<ThemedText type="title" style={styles.modalTitle}>Complete Profile</ThemedText>
						<ThemedText style={styles.modalSubtitle}>Enter your home address so the app can save your default map location.</ThemedText>
						<TextInput style={styles.input} value={profileFirstName} onChangeText={setProfileFirstName} placeholder="First Name" />
						<TextInput style={styles.input} value={profileLastName} onChangeText={setProfileLastName} placeholder="Last Name" />
						<TextInput style={styles.input} value={profileRadius} onChangeText={setProfileRadius} placeholder="Notification Radius (miles)" keyboardType="numeric" />
						<TextInput
							style={[styles.input, styles.addressInput]}
							value={profileHomeAddress}
							onChangeText={(text) => {
								setProfileHomeAddress(text);
								setProfileAddressTouched(true);
								setProfileGeocodedAddress('');
								setProfileAddressError('');
								setAddressGuidanceText('');
								if (text.trim().length > 0) {
									setProfileCoordinates(null);
								}
							}}
							onBlur={() => {
								void previewTypedAddress();
							}}
							placeholder="Home Address"
							multiline
							numberOfLines={3}
						/>

						<ThemedText style={styles.profileDirectionsText}>Type a specific address: number, street, city, state/province, and postal code when available.</ThemedText>

						{isSearchingAddress && (
							<ThemedText style={styles.profileHintText}>Searching addresses...</ThemedText>
						)}

						{profileAddressSuggestions.length > 0 && (
							<View style={styles.suggestionsPanel}>
								{profileAddressSuggestions.map((suggestion) => (
									<Pressable key={`${suggestion.displayName}-${suggestion.latitude}-${suggestion.longitude}`} style={styles.suggestionRow} onPress={() => selectAddressSuggestion(suggestion)}>
										<ThemedText style={styles.suggestionText}>{suggestion.displayName}</ThemedText>
									</Pressable>
								))}
							</View>
						)}

						{addressGuidanceText.length > 0 && (
							<ThemedText style={styles.addressGuidanceText}>{addressGuidanceText}</ThemedText>
						)}

						{isGeocodingAddress && (
							<ThemedText style={styles.profileHintText}>Looking up address...</ThemedText>
						)}

						{profileAddressError.length > 0 && (
							<ThemedText style={styles.addressErrorText}>{profileAddressError}</ThemedText>
						)}

						{/*
						<Pressable style={styles.locationButton} onPress={useCurrentLocation} disabled={savingProfile}>
							<ThemedText style={styles.locationButtonText}>Use My Location</ThemedText>
						</Pressable>
						*/}

						{profileCoordinates && (
							<ThemedText style={styles.locationSummary}>
								Selected coordinates: {profileCoordinates.latitude.toFixed(6)}, {profileCoordinates.longitude.toFixed(6)}
							</ThemedText>
						)}

						<View style={styles.modalActions}>
							<Pressable style={styles.saveButton} onPress={handleSaveProfile} disabled={savingProfile}>
								<ThemedText style={styles.saveButtonText}>{savingProfile ? 'Saving...' : 'Save'}</ThemedText>
							</Pressable>
							<Pressable style={styles.cancelButton} onPress={handleCancelProfileSetup} disabled={savingProfile}>
								<ThemedText style={styles.cancelButtonText}>Dismiss</ThemedText>
							</Pressable>
						</View>
					</View>
				</View>
			</Modal>
		</SafeAreaView>
	);
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: '#F4EADB',
	},
	container: {
		flex: 1,
		justifyContent: 'center',
		padding: 20,
	},
	card: {
		backgroundColor: '#FFF8ED',
		borderRadius: 16,
		padding: 20,
		borderWidth: 1,
		borderColor: '#D2BFA3',
	},
	title: {
		fontSize: 30,
		fontWeight: '700',
		color: '#6B3F26',
		marginBottom: 8,
	},
	subtitle: {
		fontSize: 14,
		color: '#7B6A58',
		marginBottom: 16,
	},
	input: {
		borderWidth: 1,
		borderColor: '#C8B79C',
		borderRadius: 10,
		backgroundColor: '#FFFFFF',
		paddingHorizontal: 12,
		paddingVertical: 10,
		marginBottom: 12,
	},
	primaryButton: {
		backgroundColor: '#3E7A56',
		borderRadius: 10,
		paddingVertical: 12,
		alignItems: 'center',
		marginTop: 4,
	},
	primaryText: {
		color: '#FFFFFF',
		fontWeight: '700',
		fontSize: 16,
	},
	secondaryButton: {
		marginTop: 10,
		borderWidth: 1,
		borderColor: '#6B3F26',
		borderRadius: 10,
		paddingVertical: 10,
		alignItems: 'center',
	},
	secondaryText: {
		color: '#6B3F26',
		fontWeight: '600',
	},
	tertiaryButton: {
		marginTop: 10,
		alignItems: 'center',
	},
	tertiaryText: {
		color: '#6B3F26',
		textDecorationLine: 'underline',
		fontWeight: '600',
	},
	linkButton: {
		marginTop: 14,
		alignItems: 'center',
	},
	linkText: {
		color: '#6B3F26',
		textDecorationLine: 'underline',
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.6)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	modalContent: {
		width: '100%',
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 20,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		marginBottom: 12,
	},
	modalSubtitle: {
		fontSize: 14,
		color: '#7B6A58',
		marginBottom: 12,
	},
	profileDirectionsText: {
		fontSize: 12,
		color: '#51697F',
		marginTop: 2,
		marginBottom: 8,
		lineHeight: 18,
	},
	profileHintText: {
		fontSize: 13,
		color: '#37536B',
		marginTop: 6,
		marginBottom: 4,
	},
	suggestionsPanel: {
		maxHeight: 180,
		borderWidth: 1,
		borderColor: '#C9D3DE',
		borderRadius: 8,
		backgroundColor: '#F8FBFF',
		marginTop: 4,
		marginBottom: 6,
	},
	suggestionRow: {
		paddingHorizontal: 10,
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: '#E2EAF2',
	},
	suggestionText: {
		fontSize: 13,
		color: '#2D4357',
	},
	addressGuidanceText: {
		fontSize: 12,
		color: '#7A4B1D',
		marginTop: 4,
		marginBottom: 4,
		lineHeight: 17,
	},
	addressErrorText: {
		fontSize: 13,
		color: '#9B1C1C',
		marginTop: 6,
		marginBottom: 4,
	},
	locationButton: {
		marginTop: 8,
		padding: 10,
		borderRadius: 8,
		backgroundColor: '#3E7A56',
		alignItems: 'center',
	},
	locationButtonText: {
		color: '#fff',
		fontWeight: 'bold',
	},
	locationSummary: {
		fontSize: 13,
		color: '#37536B',
		marginBottom: 10,
		lineHeight: 18,
	},
	modalActions: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginTop: 10,
	},
	addressInput: {
		height: 86,
		textAlignVertical: 'top',
	},
	saveButton: {
		backgroundColor: '#0076C0',
		padding: 10,
		borderRadius: 8,
		flex: 1,
		alignItems: 'center',
		marginRight: 5,
	},
	saveButtonText: {
		color: '#fff',
		fontWeight: 'bold',
	},
	cancelButton: {
		backgroundColor: '#999',
		padding: 10,
		borderRadius: 8,
		flex: 1,
		alignItems: 'center',
		marginLeft: 5,
	},
	cancelButtonText: {
		color: '#fff',
		fontWeight: 'bold',
	},
	modeAccentBar: {
		height: 5,
		borderRadius: 3,
		marginBottom: 14,
	},
	modeAccentCreate: {
		backgroundColor: '#3E7A56',
	},
	modeAccentLogin: {
		backgroundColor: '#6B3F26',
	},
	cardCreate: {
		borderColor: '#3E7A56',
	},
	titleCreate: {
		color: '#3E7A56',
	},
	verifyOuter: {
		flex: 1,
		justifyContent: 'center',
		padding: 24,
		backgroundColor: '#F4EADB',
	},
	verifyCard: {
		backgroundColor: '#FFF8ED',
		borderRadius: 20,
		padding: 28,
		borderWidth: 1,
		borderColor: '#3E7A56',
		alignItems: 'center',
	},
	verifyIconCircle: {
		width: 72,
		height: 72,
		borderRadius: 36,
		backgroundColor: '#DFF0E8',
		justifyContent: 'center',
		alignItems: 'center',
		marginBottom: 20,
	},
	verifyIconText: {
		fontSize: 36,
	},
	verifyTitle: {
		fontSize: 26,
		fontWeight: '700',
		color: '#3E7A56',
		marginBottom: 14,
		textAlign: 'center',
	},
	verifyBody: {
		fontSize: 15,
		color: '#4A4A4A',
		textAlign: 'center',
		lineHeight: 22,
		marginBottom: 6,
	},
	verifyEmailHighlight: {
		fontWeight: '700',
		color: '#3E7A56',
	},
	verifyInstruction: {
		fontSize: 14,
		color: '#7B6A58',
		textAlign: 'center',
		lineHeight: 20,
		marginBottom: 24,
		marginTop: 8,
	},
	verifiedButton: {
		backgroundColor: '#3E7A56',
		borderRadius: 12,
		paddingVertical: 14,
		paddingHorizontal: 48,
		alignItems: 'center',
		width: '100%',
	},
	verifiedButtonText: {
		color: '#FFFFFF',
		fontWeight: '700',
		fontSize: 17,
	},
});

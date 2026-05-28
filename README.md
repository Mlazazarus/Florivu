# PlantDex - Plant Identification & Collection App

## Project Overview

**PlantDex** is a web-based plant identification and collection application built with React and TypeScript. Users can photograph plants, get AI-powered identification results, build a personal collection of observations, and connect with other plant enthusiasts.

### Core Features

1. **Plant Identification**: Upload photos of plants to get identification results powered by the PlantNet API
2. **Observation Collection**: Save identified plants with metadata (date found, location, notes, confidence score)
3. **User Profiles**: Create public profiles with profile photos and optional social links
4. **Social Features**: Add friends and browse their plant observations
5. **Taxonomy Browsing**: Explore plant observations organized by family, genus, and species
6. **Debug Logging**: Built-in logging panel for development and troubleshooting

---

## Technology Stack

- **Framework**: React 18.2.0 with TypeScript 5.9
- **Build Tool**: Vite 5.4.8 (for fast development and optimized builds)
- **Backend/Database**: Supabase (PostgreSQL database with real-time capabilities)
- **Plant API**: PlantNet API for AI-powered plant identification
- **Image Handling**: HEIC to JPEG conversion support for cross-browser compatibility
- **Styling**: CSS (styles.css in src/)

### Development Dependencies

- React DOM 18.2.0
- @vitejs/plugin-react for fast refresh
- @supabase/supabase-js for database/auth integration

---

## Project Structure

```
PlantDex/
├── src/
│   ├── App.tsx                 # Main app component with tab routing
│   ├── main.tsx                # React entry point
│   ├── vite-env.d.ts           # Vite type definitions
│   ├── styles.css              # Global styles
│   │
│   ├── components/             # React UI components
│   │   ├── AuthPanel.tsx       # User authentication/login panel
│   │   ├── ProfilePanel.tsx    # User profile management
│   │   ├── ObservationCard.tsx # Displays single plant observation
│   │   ├── ObservationModal.tsx # Modal for viewing/editing observations
│   │   ├── TaxonomyTree.tsx    # Hierarchical plant taxonomy browser
│   │   ├── FriendsPanel.tsx    # Social features & friend browsing
│   │   └── DebugLogPanel.tsx   # Development logging interface
│   │
│   ├── hooks/                  # Custom React hooks for state management
│   │   ├── useAuth.ts          # Authentication state management
│   │   ├── usePlants.ts        # Plant observations state
│   │   ├── useProfile.ts       # User profile state
│   │   └── useFriends.ts       # Friends/social state
│   │
│   ├── lib/                    # Utility functions and API helpers
│   │   ├── plantApi.ts         # PlantNet API integration
│   │   ├── supabase.ts         # Supabase client setup
│   │   ├── accountApi.ts       # User account operations (delete, etc.)
│   │   ├── storageHelper.ts    # Image upload to Supabase storage
│   │   ├── imageFile.ts        # Image file processing & validation
│   │   ├── observationLocation.ts # Location/geolocation utilities
│   │   ├── logger.ts           # Logging utilities
│   │   ├── localObservationApi.ts # Local database operations for observations
│   │   ├── localProfileApi.ts  # Local database operations for profiles
│   │   └── localFriendsApi.ts  # Local database operations for social features
│   │
│   ├── types/                  # TypeScript interfaces & types
│   │   └── index.ts            # Type definitions for PlantNetResult, Observation, UserProfile, etc.
│   │
│   └── navigation/             # (placeholder for future routing)
│
├── supabase/                   # Supabase configuration/migrations
├── proxy_app/                  # Local proxy server for PlantNet API
├── test_images/                # Sample images for testing
├── dist/                       # Built production files (generated)
├── node_modules/               # Dependencies (generated)
│
├── package.json                # Project dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── vite.config.ts              # Vite build configuration
├── .env.example                # Environment variables template
├── index.html                  # HTML entry point
└── plantdexLogo.png            # Application logo
```

---

## Key Types & Data Models

### Core Data Types (src/types/index.ts)

**Observation**
- Represents a plant finding/identification
- Contains: ID, user_id, photo_url, plant taxonomy (family, genus, species, common_name), confidence score, date_found, zip_code, notes, timestamps

**UserProfile**
- Represents a user account
- Contains: user_id, display_name, profile_photo_url, home_zip_code, social links, public/private status, timestamps

**FriendProfile**
- Extended UserProfile with: observation_count, species_count (for social browsing)

**PlantNetResult** / **PlantNetResponse**
- Response objects from PlantNet API
- Contains identification results ranked by confidence score with botanical taxonomy data

**Taxonomy Organization**
- TaxonomyFamily → GenusGroup → SpeciesGroup → Observation[]
- Used for organizing observations hierarchically in the UI

---

## Application Flow & Tabs

The app uses a tab-based navigation system (see App.tsx). Users switch between:

1. **Identify Tab** 
   - Upload plant photo
   - Select organ type (leaf, flower, fruit, bark, auto-detect)
   - View identification results from PlantNet API
   - Save results as an Observation

2. **Collection Tab**
   - View all user's plant observations
   - Browse individual ObservationCards
   - Edit/delete observations

3. **Taxonomy Tab**
   - Browse observations organized by plant family hierarchy
   - Navigate through genera and species groupings
   - TaxonomyTree component handles hierarchical rendering

4. **Profile Tab**
   - View/edit user profile (display name, photo, zip code, social links)
   - Manage public/private visibility
   - ProfilePanel component for form interactions

5. **Friends Tab**
   - Search for other users
   - View friend profiles (observation & species counts)
   - Browse friend's plant collections
   - FriendsPanel component for social discovery

6. **Settings Tab**
   - Debug logging panel (DebugLogPanel)
   - Account deletion functionality
   - Auth panel for logout

---

## API Integration

### PlantNet API (lib/plantApi.ts)
- Endpoint: `/api/plantnet/identify` (via local proxy)
- Input: Plant photo + organ type
- Output: Ranked list of species matches with confidence scores
- Note: Uses a local proxy server to handle API key securely

### Supabase Integration (lib/supabase.ts)
- **Authentication**: User signup/login via Supabase Auth
- **Database**: PostgreSQL tables for observations, profiles, friends relationships
- **Storage**: Image uploads to Supabase storage buckets
- **Real-time**: Subscriptions for live updates (setup available in hooks)

### Local Database APIs
- `localObservationApi.ts`: CRUD operations for plant observations
- `localProfileApi.ts`: Profile data management
- `localFriendsApi.ts`: Friend relationships and social data

---

## Environment Configuration

Create a `.env` file (copy from `.env.example`) with:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
PLANTNET_API_KEY=your-plantnet-api-key
```

These enable:
- Supabase database and authentication
- PlantNet plant identification service
- Image storage and retrieval

---

## Development Commands

```bash
# Install dependencies
npm install

# Start development server (runs on http://localhost:8081 with --host 0.0.0.0)
npm run dev

# Build for production
npm run build

# Preview production build locally
npm run preview
```

---

## Key Hooks & Custom Logic

### useAuth.ts
- Manages user authentication state
- Handles login/logout/signup flows
- Tracks current user session

### usePlants.ts
- Manages user's plant observations
- Provides CRUD operations for observations
- Handles taxonomy organization

### useProfile.ts
- Manages current user's profile data
- Handles profile updates (name, photo, social links)

### useFriends.ts
- Manages friend list state
- Handles friend search and friend profile fetching
- Tracks observation/species counts for social browsing

---

## Image Processing

### Image File Handling (lib/imageFile.ts)
- Validates file types (JPEG, PNG, WEBP)
- Converts HEIC format to JPEG (Apple devices)
- Resizes images for optimization
- Prepares files for upload and API submission

### Storage Helper (lib/storageHelper.ts)
- Uploads plant photos to Supabase storage
- Uploads profile photos to Supabase storage
- Generates public URLs for retrieved images

---

## Logging & Debugging

### Logger (lib/logger.ts)
- `logInfo()`: Information messages
- `logError()`: Error tracking
- `formatError()`: Standardized error formatting
- All logs viewable in DebugLogPanel component

### DebugLogPanel
- Displays real-time logs during development
- Accessible from Settings tab
- Helps troubleshoot API calls and component state

---

## Component Responsibilities

| Component | Purpose | Key Props/State |
|-----------|---------|-----------------|
| **AuthPanel** | Login/signup/logout UI | authMode, onComplete |
| **ProfilePanel** | User profile form | profile data, onSave |
| **ObservationCard** | Individual plant display | observation, onDelete |
| **ObservationModal** | Detail view & editing | observation, onUpdate |
| **TaxonomyTree** | Hierarchical plant browser | taxonomyData, onSelect |
| **FriendsPanel** | Social features | friends list, onVisit |
| **DebugLogPanel** | Development logging | logs array, verbosity |

---

## Common Workflows

### Adding a New Plant Identification
1. User goes to "Identify" tab
2. Uploads photo (or drags/pastes)
3. Selects plant organ type
4. App calls `identifyPlant()` → PlantNet API (via proxy)
5. Results display ranked by confidence
6. User selects a result → saves as Observation
7. Observation added to collection and taxonomy tree

### Viewing Plant Collection
1. User navigates to "Collection" tab
2. `usePlants` hook fetches observations from database
3. Observations display as ObservationCards
4. User clicks card to open ObservationModal
5. Modal shows full details + edit/delete options

### Social Discovery
1. User goes to "Friends" tab
2. Searches for friend by username
3. FriendsPanel fetches friend's profile + observation counts
4. User can view friend's observations
5. Friend relationships stored in Supabase

---

## Error Handling

- Errors logged via `logger.ts` utility
- Banner notifications show user-friendly error messages
- Errors include context: component, operation, relevant data
- Failed requests include network/API status details
- Local fallback for offline operations where applicable

---

## Future Development Areas

- Real-time subscriptions (Supabase connections ready)
- Advanced search/filtering for observations
- Export observation data
- Sharing observations socially
- Plant facts/encyclopedia integration
- Seasonal plant tracking

---

## Notes for AI Agents

- **State Management**: Uses React hooks; no Redux/Zustand
- **API Calls**: Centralized in lib/ folder; one responsibility per file
- **Type Safety**: Full TypeScript typing; check types/index.ts for data models
- **Component Organization**: Features split by functionality (components, hooks, lib)
- **Error Context**: All major operations log errors; check DebugLogPanel for issues
- **Database**: Supabase PostgreSQL; connection setup in lib/supabase.ts
- **Image Handling**: Cross-browser compatible; handles HEIC, JPEG, PNG

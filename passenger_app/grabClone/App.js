import React, {Component} from 'react';
import { StyleSheet, Text, View, Button, Alert} from 'react-native';
import Pusher from 'pusher-js/react-native';
import RNGooglePlacePicker from 'react-native-google-place-picker';
import Geocoder from 'react-native-geocoding';
import MapView from 'react-native-maps';
import Spinner from 'react-native-loading-spinner-overlay';

import { regionFrom, getLatLonDiffInMeters } from './helpers';

Geocoder.setApiKey("AIzaSyC1F5BFOEvWeBv67pvGWzjMCFItmi851yg");

export default class App extends Component {

  constructor() {
    super();
    this.username = 'manoj'; // the unique username of the passenger
    this.available_drivers_channel = null; // the pusher channel where all drivers and passengers are subscribed to
    this.user_ride_channel = null; // the pusher channel exclusive to the passenger and driver in a given ride
    this.bookRide = this.bookRide.bind(this);
  
    state={
      location: null, // current location of passenger
      error: null, // for storing errors
      has_ride: false, // whether the passenger already has a driver which accepted their request
      destination: null, // for storing destination / dropoff info
      driver: null, // driver info
      origin: null, // for storing the location where the passenger booked a ride
      is_searching: false, // if the app is currently searching for a driver
      has_ridden: false, // if the passenger has already been picked up by driver
    }
  }

  bookRide() {
    RNGooglePlacePicker.show((response) => {
      if(response.didCancel) {
        console.log("User Cancelled GooglePlacePicker");
      } else if(respones.error) {
        console.log("GooglePlacePicker Error: ", response.error);
      } else {
        this.setState({
          is_searching: true, // show the loader
          destination: response // update the destination, this is used in the UI to display the name of the place
        });

        //the pickup location / origin
        let pickup_data = {
          name: this.state.origin.name,
          latitude: this.state.location.latitude,
          longitude: this.state.location.longitude
        };

        // the dropoff / destination
        let dropoff_data = {
          name: response.name,
          latitude: response.latitude,
          longitude: response.longitude
        };

        // send a ride request to all drivers
        this.available_drivers_channel.trigger("client-driver-request", {
          username: this.username,
          pickup: pickup_data,
          dropoff: dropoff_data
        });

      }
    })
  }

  _setCurrentLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        var region = regionFrom(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy
        );

        // get the name of the place by supplying the coordinates      
        Geocoder.getFromLatLng(position.coords.latitude, position.coords.longitude).then(
          (json) => {
            var address_component = json.results[0].address_components[0];

            this.setState({
              origin: { // the passenger's current location
                name: address_component.long_name, // the name of the place
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
              },
              location: region, // location to be used for the Map
              destination: null, 
              has_ride: false, 
              has_ridden: false,
              driver: null    
            });

          },
          (error) => {
            console.log('err geocoding: ', error);
          }
        );

      },
      (error) => this.setState({ error: error.message }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 3000 },
    );

  }

  componentDidMount() {

    this._setCurrentLocation(); // set current location of the passenger
    // connect to the auth server
    var pusher = new Pusher('app_id', {
      authEndpoint: 'url',
      cluster: '***',
      encrypted: true
    });

    // subscribe to the available drivers channel
    this.available_drivers_channel = pusher.subscribe('private-available-drivers');

    // subscribe to the passenger's private channel
    this.user_ride_channel = pusher.subscribe('private-ride-' + this.username);

    this.user_ride_channel.bind('client-driver-response', (data) => {
      let passenger_response = 'no';
      if(!this.state.has_ride){ // passenger is still looking for a ride
        passenger_response = 'yes';
      }

      // passenger responds to driver's response
      this.user_ride_channel.trigger('client-driver-response', {
        response: passenger_response
      });
    });

    this.user_ride_channel.bind('client-found-driver', (data) => {
      // the driver's location info  
      let region = regionFrom(
        data.location.latitude,
        data.location.longitude,
        data.location.accuracy 
      );

      this.setState({
        has_ride: true, // passenger has already a ride
        is_searching: false, // stop the loading UI from spinning
        location: region, // display the driver's location in the map
        driver: { // the driver location details
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          accuracy: data.location.accuracy
        }
      });

      // alert the passenger that a driver was found
      Alert.alert(
        "Orayt!",
        "We found you a driver. \nName: " + data.driver.name + "\nCurrent location: " + data.location.name,
        [
          {
            text: 'Sweet!'
          },
        ],
        { cancelable: false }
      );      
    });

    this.user_ride_channel.bind('client-driver-location', (data) => {
      let region = regionFrom(
        data.latitude,
        data.longitude,
        data.accuracy
      );

      // update the Map to display the current location of the driver
      this.setState({
        location: region, // the driver's location
        driver: {
          latitude: data.latitude,
          longitude: data.longitude
        }
      });

    });

    this.user_ride_channel.bind('client-driver-message', (data) => {
      if(data.type == 'near_pickup'){ // the driver is very near the pickup location
        // remove passenger marker since we assume that the passenger has rode the vehicle at this point
        this.setState({
          has_ridden: true 
        });
      }

      if(data.type == 'near_dropoff'){ // they're near the dropoff location
        this._setCurrentLocation(); // assume that the ride is over, so reset the UI to the current location of the passenger
      }

      // display the message sent from the driver app
      Alert.alert(
        data.title,
        data.msg,
        [
          {
            text: 'Aye sir!'
          },
        ],
        { cancelable: false }
      );        
    });
  }

  render() {

    return (
      <View style={styles.container}>
        <Spinner 
            visible={this.state.is_searching} 
            textContent={"Looking for drivers..."} 
            textStyle={{color: '#FFF'}} />
        <View style={styles.header}>
          <Text style={styles.header_text}>GrabClone</Text>
        </View>
        {
          !this.state.has_ride && 
          <View style={styles.form_container}>
            <Button
              onPress={this.bookRide}
              title="Book a Ride"
              color="#103D50"
            />
          </View>
        }

        <View style={styles.map_container}>  
        {
          this.state.origin && this.state.destination &&
          <View style={styles.origin_destination}>
            <Text style={styles.label}>Origin: </Text>
            <Text style={styles.text}>{this.state.origin.name}</Text>

            <Text style={styles.label}>Destination: </Text>
            <Text style={styles.text}>{this.state.destination.name}</Text>
          </View>  
        }
        {
          this.state.location &&
          <MapView
            style={styles.map}
            region={this.state.location}
          >
            {
              this.state.origin && !this.state.has_ridden &&
              <MapView.Marker
                coordinate={{
                latitude: this.state.origin.latitude, 
                longitude: this.state.origin.longitude}}
                title={"You're here"}
              />
            }

            {
              this.state.driver &&
              <MapView.Marker
                coordinate={{
                latitude: this.state.driver.latitude, 
                longitude: this.state.driver.longitude}}
                title={"Your driver is here"}
                pinColor={"#4CDB00"}
              />
            }
          </MapView>
        }
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end'
  },
  form_container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  header: {
    padding: 20,
    backgroundColor: '#333',
  },
  header_text: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold'
  },  
  origin_destination: {
    alignItems: 'center',
    padding: 10
  },
  label: {
    fontSize: 18
  },
  text: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  map_container: {
    flex: 9
  },
  map: {
   flex: 1
  },
});
import React, {Component} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import Pusher from 'pusher-js/react-native';
import MapView from 'react-native-maps';
import Geocoder from 'react-native-geocoding';
import { regionForm, getLatLonDiffInMeters, regionFrom } from './src/helpers';

Geocoder.setApiKey("AIzaSyC1F5BFOEvWeBv67pvGWzjMCFItmi851yg");

export default class App extends Component {  

  constructor() {
    super();

    this.available_drivers_channel = null; // this is where passengers will send a request to any available driver
    this.ride_channel = null; // the channel used for communicating the current location
    // for a specific ride. Channel name is the username of passenger

    this.pusher = null; // the pusher client
    state={
      passenger : null, // for storing the passenger info
      region: null, // for storing the current location of the driver
      accuracy: null, // for storing the accuracy of location
      nearby_alert: false, // whether the nearby alert has already been issued
      has_passenger: false, // 
      has_ridden: false
    }
  }

  componentWillMount() {
    this.pusher = new Pusher("app_id", {
      authEndpoint: "url",
      cluster: "cluster",
      encrypted: true
    })
  
    this.available_drivers_channel = this.pusher.subscribe("private-available-drivers"); // subscribe to available drivers
  
    // listen to "driver-request" event
    this.available_drivers_channel.bind("client-driver-request", (passenger_data) => {

      if(!this.state.has_passenger) { // if the driver has currently no passenger
        // alert the driver that they have a request
        Alert.alert(
            "You got a passenger", // alert title
            "PickUp: " + passenger_data.pickup.name + "\nDrop off: " + passenger_data.dropoff.name, // alert body
            [
              {
                text: "Later bro", // text for rejecting the request
                onPress: () => {
                  console.log("Cancel Pressed");
                },
                style: "cancel"
              }, 
              {
                text: "Gotcha!", // text for accepting request
                onPress: () => {
                  this.ride_channel = this.pusher.subscribe("private-ride-" + passenger_data.username);
                  this.ride_channel.bind("pusher:subscription_succeeded", () => {
                    // send a handshake event to the passenger
                    this.ride_channel.trigger("client-driver-response", {
                      response: "yes"  // yes driver is available
                    });

                    // listen for the acknowledgement from the passenger
                    this.ride_channel.bind("client-driver-response", (driver_response) => {
                      if(driver_response.response == "yes") { //  passenger says yes

                        // passenger has no ride yet
                        this.setState({
                          has_passenger: true,
                          passenger: {
                            username: passenger_data.username,
                            pickup: passenger_data.pickup,
                            dropoff: passenger_data.dropoff
                          }
                        });

                        Geocoder.getFromLatLng(this.state.region.latitude, this.state.region.longitude).then(
                          (json) => {
                            var address_component = json.results[0].address_components[0];
      
                            // inform passenger that it has found a driver
                            this.ride_channel.trigger("client-found-driver", {
                              driver: {
                                name: "John Smith"
                              },
                              location: {
                                name: address_component.long_name,
                                latitude: this.state.region.latitude,
                                longitude: this.state.region.longitude,
                                accuracy: this.state.accuracy
                              }
                            });
                          },
                          (error) => {
                            console.log("err geocoding: ", error);
                          }
                        );

                      } else {
                        // alert that passenger already has a ride
                        Alert.alert(
                          "Too late bro!",
                          "Another driver beat you to it.",
                          [
                            {
                              text: "Ok"
                            },
                          ],
                          { cancelable: false }
                        );
                      }
                    });
                  });
                }
              },
            ],
            { cancelable: false }  // no cancel button
        );

      }
    });
  }

  componentDidMount() {
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {

        var region = regionFrom(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy
        );

        // update the UI
        this.setState({
          region: region,
          accuracy: position.coords.accuracy
        });

        if(this.state.has_passenger && this.state.passenger) {

          this.ride_channel.trigger("client-driver-location", {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          });

          var diff_in_meter_pickup = getLatLonDiffInMeters(
            position.coords.latitude,
            position.coords.longitude,
            this.state.passenger.pickup.latitude,
            this.state.passenger.pickup.longitude
          );

          if(diff_in_meter_pickup <= 20) {

            if(!this.state.has_ridden) {
              // inform the passenger that the driver is very near

              this.ride_channel.trigger("client-driver-message", {
                type: "near_pickup",
                title: "Just a heads up",
                msg: "Your driver is near, let your presence be known"
              });

              /*
                we're going to go ahead and assume that the passenger has rode 
                the vehicle at this point
              */

              this.setState({
                has_ridden: true
              });
            }
          } else if(diff_in_meter_pickup <= 50 ) {

            if(!this.state.nearby_alert) {
              this.setState({
                nearby_alert: true
              });
              /*
                since the location updates every 10 meters, this alert will be triggered 
                at least five times unless we do this
              */
            
              Alert.alert(
                "Slow Down",
                "Your passenger is just around the corner",
                [
                  {
                    text: "Gotcha!"
                  },
                ],
                { cancelable: false }
              );
            }
          }

          var diff_in_meter_dropoff = getLatLonDiffInMeters(
            position.coords.latitude,
            position.coords.longitude,
            this.state.passenger.dropoff.latitude,
            this.state.passenger.dropoff.longitude
          );

          if(diff_in_meter_dropoff <= 20) {
            this.ride_channel.trigger("client-driver-message", {
              type: "near_dropoff",
              title: "Brace yourself",
              msg: "You're very close to your destination. Please prepare your payment."
            });

            // unbind from passenger event
            this.ride_channel.unbind("client-driver-response");

            // unsubscribe from passenger channel 
            this.pusher.unsubscribe("private-ride-" + this.state.passenger.username);

            this.setState({
              passenger: null,
              has_passenger: false,
              has_ridden: false
            });

          }

        }
      },
      (error) => this.setState({ error: error.message }),
      {
        enableHighAccuracy: true, // allows you to get the most accurate location
        timeout: 20000, // (milliseconds) in which the app has to wait for location before it throws an error
        maximumAge: 1000, // (milliseconds) if a previous location exists in the cache, how old for it to be considered acceptable
        distanceFilter: 10 // (meters) how many meters the user has to move before a location update is triggered
      },
    );
  }

  componentWillUnmount() {
    navigator.geolocation.clearWatch(this.watchId);
  }

  render() {
    return (
      <View
        style={styles.container}
      >
        {
          this.state.region && 
          <MapView
            style={styles.map}
            region={this.state.region}
          >
            <MapView.Marker 
              coordinate={{
                latitude: this.state.region.latitude,
                longitude: this.state.region.longitude
              }}
              title={"You are here"}
            />
            {
              this.state.passenger && !this.state.has_ridden &&
              <MapView.Marker
                coordinate={{
                  latitude: this.state.passenger.pickup.latitude,
                  longitude: this.state.passenger.pickup.longitude
                }}
                title={"Your passenger is here"}
                pinColor={"#4CDB00"}
              />
            }
          </MapView>
        }
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    alignItems: "center"
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
});